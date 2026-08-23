# Section-level Service Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the report-wide Service selection with low-click Section-level Service assignment for GENERAL and NICHE targets.

**Architecture:** Introduce physical `ScopeTarget` records that expand into service-aware `ReportSection` records. Keep all downstream photo, condition, pagination, QA, preview, and PDF behavior keyed by the expanded section ID; update folder matching to add a Service segment only when the legacy hierarchy would be ambiguous.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-section-service-scope-design.md`

## Global Constraints

- GENERAL is always the fixed FWD/FWD-MID/MID/MID-AFT/AFT × PORT/STBD/BOTTOM target catalog, but only assigned targets become report sections.
- INSPECTION uses CURRENT; every other service uses BEFORE/AFTER.
- AFTER starts at editable CLEAN/R0.
- Preserve `PhotoData { sectionId, phase, file, reportUse, order }` and local File references.
- Never guess an ambiguous photo path; leave it UNMATCHED.
- Keep the Windows Chrome/Edge 1440px-first workflow and existing automatic pagination.

---

### Task 1: Physical targets and service-aware report sections

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/structure.ts`
- Modify: `src/domain/structure.test.ts`

**Interfaces:**
- Produces: `ScopeTarget`, `createGeneralTargets()`, `createNicheTargets(input)`, `replaceTargetService(target, service)`, `appendTargetService(target, service)`, `applyServicePreset(targets, service, predicate)`, and `createReportSections(targets)`.
- `ReportSection.targetId` is the physical path; `ReportSection.id` is `${service}/${targetId}`.

- [ ] **Step 1: Write failing target-assignment tests**

Add tests proving GENERAL creates 15 unassigned targets, a preset changes only unassigned targets, replacement preserves exceptions, append permits two services on one target, and expansion creates service-aware IDs with correct phases.

```ts
const targets = createGeneralTargets();
const polishing = applyServicePreset(targets, 'POLISHING', () => true);
const exception = polishing.map((target) =>
  target.id === 'GENERAL/AFT/STBD' ? replaceTargetService(target, 'INSPECTION') : target,
);
expect(createReportSections(exception).find((item) => item.targetId === 'GENERAL/AFT/STBD'))
  .toMatchObject({ id: 'INSPECTION/GENERAL/AFT/STBD', phases: ['CURRENT'] });
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm run test:run -- src/domain/structure.test.ts`

Expected: FAIL because the target APIs and `targetId` do not exist.

- [ ] **Step 3: Implement the minimal target model and expansion**

Create physical target IDs from area/component/side/unit. Presets must clone changed records and skip targets whose `services.length > 0`. Expansion must preserve service order and initialize phases and conditions through the existing rules.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm run test:run -- src/domain/structure.test.ts`

Expected: all structure tests pass.

- [ ] **Step 5: Commit the domain model**

```powershell
git add src/domain/types.ts src/domain/structure.ts src/domain/structure.test.ts
git commit -m "feat: add section-level service assignments"
```

### Task 2: Exact folder matching for mixed services

**Files:**
- Modify: `src/domain/photos.ts`
- Modify: `src/domain/photos.test.ts`
- Modify: `src/browser/directory.ts`
- Modify: `src/browser/directory.test.ts`

**Interfaces:**
- `sectionDirectorySegments(section)` continues returning the physical hierarchy.
- `needsServiceDirectory(section, sections)` returns true only when another section on the same target shares a phase.
- `directorySegments(section, phase, sections)` optionally prefixes `section.service`.
- `matchPhotoPath(relativePath, sections)` accepts exact legacy and Service-prefixed paths.

- [ ] **Step 1: Write failing ambiguity tests**

```ts
const sections = createReportSections([
  { ...createGeneralTargets()[0], services: ['CLEANING', 'POLISHING'] },
]);
expect(matchPhotoPath('GENERAL/FWD/PORT/BEFORE/a.jpg', sections)).toBeNull();
expect(matchPhotoPath('POLISHING/GENERAL/FWD/PORT/BEFORE/a.jpg', sections)).toEqual({
  sectionId: 'POLISHING/GENERAL/FWD/PORT', phase: 'BEFORE',
});
```

Also assert `createSectionTree` creates Service-prefixed branches for the ambiguous pair and keeps the legacy hierarchy for a unique target.

- [ ] **Step 2: Run focused photo and directory tests and verify RED**

Run: `npm run test:run -- src/domain/photos.test.ts src/browser/directory.test.ts`

Expected: FAIL because service-aware IDs and ambiguity-aware paths are unsupported.

- [ ] **Step 3: Implement exact dual-form matching**

Normalize path tokens, parse the phase, detect an optional leading Service token, compare the remaining hierarchy exactly, and return a match only when one candidate remains. Extend `folderRelativePath` so a selected browser root can be removed before either a Service or AREA token.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm run test:run -- src/domain/photos.test.ts src/browser/directory.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit folder matching**

```powershell
git add src/domain/photos.ts src/domain/photos.test.ts src/browser/directory.ts src/browser/directory.test.ts
git commit -m "feat: match mixed-service photo folders exactly"
```

### Task 3: Service brush, GENERAL matrix, and NICHE exceptions

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/App.test.tsx`

**Interfaces:**
- App draft state stores 15 GENERAL `ScopeTarget` records and NICHE groups containing `ScopeTarget[]`.
- Main target click replaces services with the active Service; the add control appends it.
- GENERAL presets call `applyServicePreset` and affect unassigned cells only.
- `buildScope()` calls `createReportSections([...generalTargets, ...nicheTargets])`.

- [ ] **Step 1: Write failing low-click workflow tests**

Test that Scope creation is disabled before assignment, `전체 적용` assigns all 15, selecting Inspection and clicking AFT/STBD replaces only that target, preset reapplication does not overwrite it, and undo restores the last GENERAL state. Test that adding a quantity NICHE component assigns every generated Unit to the active Service.

```ts
await user.click(screen.getByRole('button', { name: '전체 적용' }));
await user.click(screen.getByRole('button', { name: 'Inspection 작업 선택' }));
await user.click(screen.getByRole('button', { name: 'AFT STBD 작업 배정' }));
expect(screen.getByLabelText('AFT STBD 배정 상태')).toHaveTextContent('INSPECTION');
```

- [ ] **Step 2: Run App tests and verify RED**

Run: `npm run test:run -- src/App.test.tsx`

Expected: FAIL because the matrix and Service brush controls do not exist.

- [ ] **Step 3: Implement the matrix and reusable target cell**

Replace the global Service select and GENERAL checkbox with visible Service brush buttons, preset buttons, a 5 × 3 matrix, assignment chips, append controls, and one-level undo. Render NICHE target cells beneath each component tag. Lock all draft controls after Scope creation as before.

- [ ] **Step 4: Update report-wide labels for mixed services**

Derive the top-bar service summary from `report.sections`. Show `section.service` in Section labels and scope counts. Keep Phase panels driven by each expanded section's existing `phases` property.

- [ ] **Step 5: Run App tests and verify GREEN**

Run: `npm run test:run -- src/App.test.tsx`

Expected: all App tests pass with the new assignment workflow.

- [ ] **Step 6: Commit the PC scope UI**

```powershell
git add src/App.tsx src/styles.css src/App.test.tsx
git commit -m "feat: add low-click section service matrix"
```

### Task 4: Mixed-service PDF and end-to-end workflow

**Files:**
- Modify: `src/pdf/exportReport.ts`
- Modify: `src/pdf/exportReport.test.ts`
- Modify: `e2e/demo.spec.ts`
- Modify: `README.md`

**Interfaces:**
- `ExportInput` no longer consumes a single Service.
- PDF headers use `section.service`; the default file name uses one Service or `MULTI_SERVICE`.
- E2E scope setup uses `전체 적용` before creating Scope.

- [ ] **Step 1: Write a failing mixed-service PDF test**

Create Cleaning and Inspection sections, export them, and assert the writer receives both Service labels while maintaining CURRENT and BEFORE/AFTER badges.

- [ ] **Step 2: Run the PDF test and verify RED**

Run: `npm run test:run -- src/pdf/exportReport.test.ts`

Expected: FAIL because PDF headers still use `input.service`.

- [ ] **Step 3: Implement per-section PDF service labels**

Remove the report-wide Service input, render `section.service` in the header, and derive the default file-name suffix from the unique services in `sections`.

- [ ] **Step 4: Update E2E setup and documentation**

Have the E2E helper click `전체 적용`, then create Scope. Add an E2E scenario that assigns Inspection to one GENERAL cell, creates Scope, and verifies CURRENT for that section while another section has BEFORE/AFTER. Document the Service brush, presets, replacement, append, and NICHE exception behavior.

- [ ] **Step 5: Run focused and complete verification**

Run:

```powershell
npm run test:run
npx tsc --noEmit
npm run lint
npm run build:portable
npm run test:e2e
```

Expected: every command exits 0; Vitest and Playwright report zero failures.

- [ ] **Step 6: Commit integration changes**

```powershell
git add src/pdf/exportReport.ts src/pdf/exportReport.test.ts e2e/demo.spec.ts README.md
git commit -m "feat: complete mixed-service report workflow"
```

### Task 5: Merge and deploy the verified feature

**Files:**
- Merge branch: `feat/section-service-scope` into `main`
- Deploy through: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: all verified commits from Tasks 1–4.
- Produces: updated GitHub Pages test site at `https://nost13.github.io/underwater-report-demo/`.

- [ ] **Step 1: Review branch diff and rerun the full verification suite**

Confirm no generated screenshots, PDFs, build artifacts, or local photos are tracked. Rerun tests, type checking, lint, portable build, and E2E from the feature worktree.

- [ ] **Step 2: Merge to main and push**

Fast-forward or merge the verified feature branch into `main`, then push `main` to `origin`.

- [ ] **Step 3: Verify GitHub Actions and deployed HTTP response**

Wait for the Pages workflow to complete successfully, request the public URL, and confirm HTTP 200 plus the React root and asset references.

