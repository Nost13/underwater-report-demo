# Report Information and Word Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Report Information workflow, preserve the service in WORK PERFORM with an editable phase label, remove duplicate Word pagination, improve Word vessel-diagram fill, and reduce marker handles.

**Architecture:** Extend the existing report state with a Section+Phase additional-label map, pass that map through the preview and Word model, and keep the supplied Word template styling untouched. Add a focused Report Information component backed by the existing `ReportInfo` structure. Perform output-only vessel-diagram trimming after composition and remove the redundant merge page break.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, JSZip/OOXML, browser Canvas, Playwright, vinext/Vite, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-02-report-information-word-layout-design.md`

## Global Constraints

- Do not change the template font family, font size, run styling, or Job No. capitalization.
- `WORK PERFORM` retains the service name; the editable Before/After text is an additional label.
- The left detail title must not contain `(Before)`, `(After)`, or `(Current)`.
- Existing reports without saved additional labels derive them from the phase.
- Word output may trim unused outer image whitespace but must not distort or crop the ship or markers.
- Preserve unrelated user files, especially `.superpowers/brainstorm/`.

---

### Task 1: Model the additional WORK PERFORM label

**Files:**
- Create: `src/app/workPerformLabels.ts`
- Create: `src/app/workPerformLabels.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/app/reportState.ts`
- Modify: `src/app/reportState.test.ts`
- Modify: `src/docx/reportModel.ts`
- Modify: `src/docx/reportModel.test.ts`

**Interfaces:**
- Produces: `WorkPerformLabelMap = Record<string, string>`
- Produces: `workPerformLabelKey(sectionId: string, phase: Phase): string`
- Produces: `defaultWorkPerformLabel(phase: Phase): string`
- Extends: `TemplateValues` with `workAdditional: string`
- Extends: `buildWordPhasePages(..., workPerformLabels?: WorkPerformLabelMap)`

- [ ] **Step 1: Write failing default/key tests**

```ts
expect(defaultWorkPerformLabel('BEFORE')).toBe('Before');
expect(defaultWorkPerformLabel('AFTER')).toBe('After');
expect(defaultWorkPerformLabel('CURRENT')).toBe('Current');
expect(workPerformLabelKey('rope-guard', 'BEFORE')).toBe('rope-guard::BEFORE');
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm test:run src/app/workPerformLabels.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement label helpers and state initialization**

```ts
export type WorkPerformLabelMap = Record<string, string>;
export const workPerformLabelKey = (sectionId: string, phase: Phase) => `${sectionId}::${phase}`;
export const defaultWorkPerformLabel = (phase: Phase) =>
  phase[0] + phase.slice(1).toLowerCase();
```

Add `workPerformLabels` to `ReportState`; populate one default for every Section phase during `SET_SCOPE`; add `UPDATE_WORK_PERFORM_LABEL` that changes only the selected Section+Phase value.

- [ ] **Step 4: Write reducer and report-model failing tests**

```ts
expect(seeded.workPerformLabels[`${section.id}::BEFORE`]).toBe('Before');
expect(reportReducer(seeded, {
  type: 'UPDATE_WORK_PERFORM_LABEL', sectionId: section.id, phase: 'BEFORE', value: 'Arrival',
}).workPerformLabels[`${section.id}::BEFORE`]).toBe('Arrival');

expect(templateValues(section, 'BEFORE')).toMatchObject({
  title: 'BOSS CAP', work: 'Cleaning', workAdditional: 'Before',
});
```

- [ ] **Step 5: Implement report-model propagation**

Remove the phase suffix from `TemplateValues.title`. Resolve `workAdditional` from the Section+Phase map, preserving an explicitly empty string and falling back to the default only when the key is absent. Pass the map through `buildWordPhasePages`; continuation pages inherit the same resolved value.

- [ ] **Step 6: Run focused tests**

Run: `pnpm test:run src/app/workPerformLabels.test.ts src/app/reportState.test.ts src/docx/reportModel.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/workPerformLabels.ts src/app/workPerformLabels.test.ts src/domain/types.ts src/app/reportState.ts src/app/reportState.test.ts src/docx/reportModel.ts src/docx/reportModel.test.ts
git commit -m "feat: add editable work perform phase labels"
```

### Task 2: Add the Report Information workflow step

**Files:**
- Create: `src/app/ReportInformation.tsx`
- Create: `src/app/ReportInformation.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `ReportInfo`, `React.Dispatch<React.SetStateAction<ReportInfo>>`
- Produces: `ReportInformation({ value, onChange, onBack, onNext })`

- [ ] **Step 1: Write a failing component test**

```tsx
render(<ReportInformation value={emptyReportInfo()} onChange={setInfo} onBack={vi.fn()} onNext={vi.fn()} />);
expect(screen.getByRole('heading', { name: 'Report Information' })).toBeVisible();
for (const label of ['ETA', 'ETD', 'Work Window', 'Location', 'Start', 'End', 'Working Time',
  'Position', 'Draught FWD', 'Draught MID', 'Draught AFT', 'Berthing Side', 'Weather',
  'Knots', 'Current', 'Visibility', 'Personnel Deployed']) {
  expect(screen.getByLabelText(label)).toBeVisible();
}
```

- [ ] **Step 2: Run the component test and confirm failure**

Run: `pnpm test:run src/app/ReportInformation.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the Section 1–4 form**

Render grouped fieldsets for Vessel Schedule, Operation Record, Vessel & Site, Personnel Deployed, and Safety / Readiness. Each input updates only its nested `ReportInfo` object. Use the existing `.field`, panel, button, typography, and color tokens; add only responsive grid rules required for two-row wrapping.

- [ ] **Step 4: Write failing workflow tests**

```ts
expect(within(rail).getByRole('button', { name: 'Report Information' })).toBeVisible();
await user.click(screen.getByRole('button', { name: 'Report Information으로' }));
await user.type(screen.getByLabelText('Work Window'), '24 HOURS');
await user.click(screen.getByRole('button', { name: '선박 위치도 설정으로' }));
expect(screen.getByRole('heading', { name: '선박 위치도 설정' })).toBeVisible();
```

- [ ] **Step 5: Insert the stage and update navigation gates**

Use stage order `Vessel / Scope`, `Report Information`, `Vessel Diagram`, `사진 폴더`, `Report Input`, `Check / Preview`, `Word`. Scope creation unlocks Report Information and Vessel Diagram; Photo Folder and later stages still require a confirmed diagram. Shift every route, back/next callback, issue focus route, and diagram error return to the new indexes.

- [ ] **Step 6: Remove the old collapsed ReportInfoPanel from Vessel / Scope**

Keep Owner / Client and Job No. on the vessel card. All operational/readiness fields move to the dedicated page; do not duplicate them.

- [ ] **Step 7: Run focused application tests**

Run: `pnpm test:run src/app/ReportInformation.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/ReportInformation.tsx src/app/ReportInformation.test.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add report information workflow step"
```

### Task 3: Add the additional-label editor and preview

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `report.workPerformLabels`
- Dispatches: `UPDATE_WORK_PERFORM_LABEL`
- Preview output: service and supporting label as visually separate inline values

- [ ] **Step 1: Write failing interaction and preview tests**

```ts
expect(screen.getByLabelText('BEFORE WORK PERFORM 추가 문구')).toHaveValue('Before');
await user.clear(screen.getByLabelText('BEFORE WORK PERFORM 추가 문구'));
await user.type(screen.getByLabelText('BEFORE WORK PERFORM 추가 문구'), 'Arrival');
expect(within(firstPage).getByText('Cleaning')).toBeVisible();
expect(within(firstPage).getByText('Arrival')).toBeVisible();
expect(within(firstPage).queryByText(/\(Before\)/)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm test:run src/App.test.tsx -t "WORK PERFORM"`
Expected: FAIL because the editor and additional preview value are absent.

- [ ] **Step 3: Add one editor per visible phase panel**

Place a compact `WORK PERFORM` row beside the existing phase metadata. Show the derived service value read-only and an `추가 문구` input. Editing updates the active Section+Phase only; clearing the input intentionally exports no additional label.

- [ ] **Step 4: Pass labels through preview and export**

Every `buildWordPhasePages` call receives `report.workPerformLabels`. `runExport` includes `workPerformLabels` in `WordExportInput`. Preview renders `<strong>{page.values.work}</strong>` and a separate supporting element only when `workAdditional` is non-empty.

- [ ] **Step 5: Run application tests**

Run: `pnpm test:run src/App.test.tsx src/docx/reportModel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: edit work perform supporting labels"
```

### Task 4: Write revised WORK PERFORM values and remove the blank page

**Files:**
- Modify: `src/docx/templateWriter.ts`
- Modify: `src/docx/templateWriter.test.ts`
- Modify: `src/docx/templateWriter.integration.test.ts`

**Interfaces:**
- Extends: `WordExportInput.workPerformLabels?: WorkPerformLabelMap`
- Writes: `{{WORK}} = [service, additional label].filter(Boolean).join(' ')`

- [ ] **Step 1: Update tests to describe the revised Word output**

```ts
expect(documentText).toContain('ROPE GUARD');
expect(documentText).not.toContain('ROPE GUARD (Before)');
expect(documentText).toContain('Removal Before');
expect(documentXml).not.toContain('<w:br w:type="page"/>');
expect(documentXml.match(/pageBreakBefore/g)).toHaveLength(1);
```

Include a five-photo continuation case and assert that both generated pages use the same supporting label.

- [ ] **Step 2: Run writer tests and confirm failure**

Run: `pnpm test:run src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts`
Expected: FAIL on old title/work text and duplicate merge-page behavior.

- [ ] **Step 3: Implement text output**

Pass `input.workPerformLabels` into `buildWordPhasePages`. Replace `{{WORK}}` with `[page.values.work, page.values.workAdditional].filter(Boolean).join(' ')`. Do not create new Word runs or change run properties.

- [ ] **Step 4: Remove the duplicate merge break**

In `prependSection14Package`, concatenate `section14Parts.body + detailedBody` without the explicit `<w:br w:type="page"/>` paragraph. Keep `markPageStart` as the only detailed-page boundary.

- [ ] **Step 5: Run writer tests**

Run: `pnpm test:run src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/docx/templateWriter.ts src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts
git commit -m "fix: revise detail headings and page boundary"
```

### Task 5: Fill the Word vessel-diagram rectangle safely

**Files:**
- Modify: `src/vesselDiagram/composer.ts`
- Modify: `src/vesselDiagram/composer.test.ts`
- Modify: `src/docx/templateWriter.ts`
- Modify: `src/docx/templateWriter.test.ts`

**Interfaces:**
- Produces: `contentBounds(imageData, width, height, threshold): PixelRect | null`
- Produces: `composeVesselDiagram(..., options?: { trimOuterWhitespace?: boolean }): Promise<Uint8Array>` or an equivalent dependency-safe output-only mode
- Preview remains untrimmed; Word export requests trimming

- [ ] **Step 1: Write failing pure bounds tests**

```ts
expect(contentBounds(whiteWithDarkCenter, 10, 10, 248)).toEqual({ x: 2, y: 3, width: 6, height: 4 });
expect(contentBounds(allWhite, 10, 10, 248)).toBeNull();
```

- [ ] **Step 2: Run composer tests and confirm failure**

Run: `pnpm test:run src/vesselDiagram/composer.test.ts`
Expected: FAIL because `contentBounds` and trimmed composition do not exist.

- [ ] **Step 3: Implement output-only trimming**

After drawing the ship and markers, read pixel data, find non-transparent/non-near-white bounds, add a small safety pad, and redraw that source rectangle into a fresh `DIAGRAM_WIDTH × DIAGRAM_HEIGHT` white canvas using `fitContain`. If pixel reads are unavailable, bounds are empty, or encoding fails, return the original composed PNG path.

- [ ] **Step 4: Restrict trimming to Word export**

The preview continues to call the existing default composition. The Word writer requests trimmed composition, preserving web-to-marker coordinate behavior while using more of the template rectangle.

- [ ] **Step 5: Run composer and writer tests**

Run: `pnpm test:run src/vesselDiagram/composer.test.ts src/docx/templateWriter.test.ts`
Expected: PASS, including assertions that the aspect ratio is preserved and marker pixels remain inside the output.

- [ ] **Step 6: Commit**

```bash
git add src/vesselDiagram/composer.ts src/vesselDiagram/composer.test.ts src/docx/templateWriter.ts src/docx/templateWriter.test.ts
git commit -m "feat: maximize vessel diagram in word output"
```

### Task 6: Reduce selected-marker handles

**Files:**
- Modify: `src/styles.css`
- Modify: `e2e/demo.spec.ts`

**Interfaces:**
- Visible handle: 8 px overall
- Pointer target: 24 px square
- Existing selected-only visibility and corner resize events remain unchanged

- [ ] **Step 1: Add failing browser assertions**

```ts
expect(handleBox!.width).toBeCloseTo(24, 0);
expect(handleBox!.height).toBeCloseTo(24, 0);
expect(await resizeHandle.evaluate((node) => getComputedStyle(node, '::after').width)).toBe('6px');
```

- [ ] **Step 2: Run the focused browser test and confirm failure**

Run: `pnpm test:e2e --grep "vessel diagram receives real guide"`
Expected: FAIL because the current target is 40 px and the visible square is 12 px plus border.

- [ ] **Step 3: Update handle CSS**

Set `.marker-handle` to `24px × 24px`, corner offsets to `-12px`, and `::after` to `6px × 6px` with a `1px` border. Do not change event handlers or circular marker dimensions.

- [ ] **Step 4: Run the focused browser test**

Run: `pnpm test:e2e --grep "vessel diagram receives real guide"`
Expected: PASS; move, resize, keyboard, Ctrl multi-select, and equal-size controls remain usable.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css e2e/demo.spec.ts
git commit -m "fix: reduce vessel marker resize handles"
```

### Task 7: Full verification and deployment

**Files:**
- Modify as needed only for test corrections discovered during verification

**Interfaces:**
- Consumes: all previous task outputs
- Produces: a passing production build and deployed GitHub Pages site

- [ ] **Step 1: Run all unit and integration tests**

Run: `pnpm test:run`
Expected: all tests PASS.

- [ ] **Step 2: Run lint and builds**

Run: `pnpm lint`
Expected: PASS with no errors.

Run: `pnpm build`
Expected: production build PASS.

Run: `pnpm build:portable`
Expected: portable build PASS.

- [ ] **Step 3: Run the complete browser suite**

Run: `pnpm test:e2e`
Expected: all local browser flows PASS; the packaged-server-only test may remain skipped unless that server mode is active.

- [ ] **Step 4: Inspect the generated DOCX package**

Open the E2E-generated DOCX as ZIP and verify `word/document.xml` contains one detailed-page `pageBreakBefore`, no explicit merge `<w:br w:type="page"/>`, service plus supporting label, no title phase suffix, and no unresolved template tokens. Confirm `word/styles.xml` is byte-identical to the source template style part.

- [ ] **Step 5: Confirm the worktree contains only intended changes**

Run: `git status --short`
Expected: only `.superpowers/brainstorm/` remains untracked; all implementation files are committed. If verification exposed a defect, return to the owning task's failing-test step, correct it, rerun that task's checks, and commit the exact files listed by `git status --short` before continuing.

- [ ] **Step 6: Push and monitor GitHub Pages**

Run: `git push origin main`
Expected: push succeeds and starts the Pages workflow.

Run: `gh run list --limit 5`
Expected: identify the deployment run for the pushed commit.

Run: `gh run watch <run-id> --exit-status`
Expected: workflow completes successfully.

- [ ] **Step 7: Verify the public site**

Open `https://nost13.github.io/underwater-report-demo/`, confirm HTTP 200, confirm the Report Information stage is present, and exercise the revised WORK PERFORM additional-label field.
