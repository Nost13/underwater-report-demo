# Photo Import, Slime Range, and Continuous Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make photo-import completion explicit, collect the manually entered slime-only coverage, and simplify check/preview viewing.

**Architecture:** Keep `Condition` as the single phase-level source of truth by storing a nullable numeric `slimeCoverage` alongside the existing coverage category. `App` owns import-completion UI state and renders all generated pages for the selected section in a two-column scrollable preview; photo thumbnails remain lazy through the existing thumbnail component.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Playwright, Vite.

**Spec:** `docs/superpowers/specs/2026-08-24-active-phase-condition-design.md`

## Global Constraints

- Preserve local-only `File` references; do not add server storage or Base64 image data.
- Keep the PC-first desktop workflow and existing photo pagination rules.
- Slime Only must retain R1 / Micro fouling while requiring a user-entered 1–100% surface coverage.
- Observed condition continues to default to Normal / Trace.
- Preview all generated pages without pager interaction and retain lazy thumbnail loading.

---

### Task 1: Model and validate Slime Only coverage

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/conditions.ts`, `src/domain/qa.ts`
- Test: `src/domain/conditions.test.ts`, `src/domain/qa.test.ts`

**Interfaces:**
- Produces: `Condition.fouling.slimeCoverage: number | null` and a condition summary that contains the typed slime percentage.

- [ ] **Step 1: Write failing tests**

```ts
expect(formatConditionSummary({
  fouling: { type: 'Micro fouling', coverage: '1-100% / Slime Only', slimeCoverage: 37 },
  observed: { type: '', level: 'Normal / Trace' },
})).toContain('Slime Only 37%');
```

Add a QA fixture with Slime Only and `slimeCoverage: null`; assert it produces `MISSING_CONDITION`.

- [ ] **Step 2: Run targeted tests and confirm expected failures**

Run: `pnpm test:run src/domain/conditions.test.ts src/domain/qa.test.ts`

- [ ] **Step 3: Implement the minimum model, formatting, and QA rule**

Add `slimeCoverage` defaults to `emptyCondition` and `cleanCondition`; require a finite integer from 1 through 100 only when Slime Only is selected.

- [ ] **Step 4: Re-run targeted tests and confirm they pass**

Run: `pnpm test:run src/domain/conditions.test.ts src/domain/qa.test.ts`

### Task 2: Clarify import state and collect slime coverage in the phase UI

**Files:**
- Modify: `src/App.tsx`, `src/styles.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `Condition.fouling.slimeCoverage` from Task 1.
- Produces: a persistent `사진 불러오기 완료` state after a successful folder/fallback import and an accessible `${phase} slime coverage` number input only for Slime Only.

- [ ] **Step 1: Write failing UI tests**

```ts
await user.selectOptions(screen.getByLabelText('BEFORE fouling coverage'), '1-100% / Slime Only');
await user.type(screen.getByLabelText('BEFORE slime coverage'), '37');
expect(screen.getByLabelText('BEFORE fouling rating')).toHaveTextContent('R1');
expect(screen.getByLabelText('BEFORE fouling type')).toHaveTextContent('Micro fouling');
```

Use the existing folder-upload test setup to assert that a completed import displays `사진 불러오기 완료`.

- [ ] **Step 2: Run the App test and confirm expected failure**

Run: `pnpm test:run src/App.test.tsx`

- [ ] **Step 3: Implement the minimal UI state and fields**

Reset completion when a new scope or new folder is selected. Mark it complete after a successful folder or fallback scan. Show the 1–100 number input only for Slime Only and persist it with `UPDATE_CONDITION`.

- [ ] **Step 4: Re-run the App test and confirm it passes**

Run: `pnpm test:run src/App.test.tsx`

### Task 3: Collapse Report Check and show all preview pages

**Files:**
- Modify: `src/App.tsx`, `src/styles.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: a collapsed-by-default issue summary and a scrollable, two-column `전체 Report Preview` with all selected-section pages rendered.

- [ ] **Step 1: Write failing UI test**

```ts
await user.click(screen.getByRole('button', { name: 'Check / Preview' }));
expect(screen.getByRole('button', { name: /Report Check.*issues/ })).toBeVisible();
expect(screen.queryByText('MISSING PHASE PHOTO')).not.toBeInTheDocument();
await user.click(screen.getByRole('button', { name: /Report Check.*issues/ }));
expect(screen.getAllByText('MISSING PHASE PHOTO').length).toBeGreaterThan(0);
expect(screen.getByLabelText('전체 Report Preview')).toBeVisible();
```

- [ ] **Step 2: Run the App test and confirm expected failure**

Run: `pnpm test:run src/App.test.tsx`

- [ ] **Step 3: Implement the minimum display changes**

Remove page navigation controls and the neighboring-page fade state. Render every selected-section report page in a two-column scrollable stage. Keep the section selector and existing `PhotoThumb` behavior. Replace the always-open QA list with a summary toggle that expands the same issue buttons.

- [ ] **Step 4: Re-run the App test and confirm it passes**

Run: `pnpm test:run src/App.test.tsx`

### Task 4: Verify, commit, and publish

**Files:**
- Modify: only the files changed above.

- [ ] **Step 1: Run complete validation**

Run: `pnpm test:run`; `pnpm lint`; `.\\node_modules\\.bin\\tsc.cmd --noEmit`; `pnpm build:portable`; `.\\node_modules\\.bin\\playwright.cmd test`.

- [ ] **Step 2: Inspect final worktree**

Run: `git diff --check` and `git status --short`.

- [ ] **Step 3: Commit and push**

Run: `git add src docs && git commit -m "feat: simplify photo check and preview" && git push`.

- [ ] **Step 4: Verify public deployment**

Wait for the GitHub Pages workflow to succeed and fetch the cache-busted public bundle to confirm the new UI markers are present.
