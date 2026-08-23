# Active Phase Photo Assignment and Condition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select a report phase before assigning drawer photos, and capture Fouling and Observed conditions with ratings derived from Coverage and Level.

**Architecture:** Replace the old flat `Condition` shape with explicit Fouling and Observed groups and derive rating values in pure domain helpers. Keep the active photo destination as local `App` UI state; reducer assignment remains the single persistence boundary. Render reusable condition summaries for caption, preview, and PDF.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Playwright, jsPDF, Vite.

**Spec:** `docs/superpowers/specs/2026-08-24-active-phase-condition-design.md`

## Global Constraints

- Use local File references only; never encode source images as Base64.
- Do not delete original files when deleting a report photo.
- Preserve BEFORE/AFTER pagination and report-use behavior.
- Support desktop Chrome/Edge at 1440px.

---

### Task 1: Derive report condition ratings from user inputs

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/structure.ts`
- Create: `src/domain/conditions.ts`
- Create: `src/domain/conditions.test.ts`

**Interfaces:**
- Produces `deriveFoulingRating(coverage)` and `deriveObservedRating(level)`.
- Produces `formatConditionSummary(condition)` for caption, preview, and PDF.

- [x] **Step 1: Write failing domain tests**

```ts
expect(deriveFoulingRating('6-25%')).toBe('3');
expect(deriveObservedRating('Significant Observation')).toBe('4');
```

- [x] **Step 2: Run the domain test and verify it fails because the helpers do not exist**

Run: `pnpm test:run src/domain/conditions.test.ts`

- [x] **Step 3: Add the explicit Fouling and Observed types, defaults, mappings, and formatter**

- [x] **Step 4: Run the domain test and verify it passes**

Run: `pnpm test:run src/domain/conditions.test.ts`

### Task 2: Persist structured conditions and validate Fouling input

**Files:**
- Modify: `src/app/reportState.ts`
- Modify: `src/app/reportState.test.ts`
- Modify: `src/domain/qa.ts`
- Modify: `src/domain/qa.test.ts`

**Interfaces:**
- Consumes the `Condition` shape from Task 1.
- `UPDATE_CONDITION` accepts a partial structured condition and preserves the other group.

- [x] **Step 1: Write failing reducer and QA tests for independent phase conditions and required Fouling type/coverage**
- [x] **Step 2: Run targeted tests and verify the legacy flat behavior fails**

Run: `pnpm test:run src/app/reportState.test.ts src/domain/qa.test.ts`

- [x] **Step 3: Update reducer defaults and QA completeness checks**
- [x] **Step 4: Run targeted tests and verify they pass**

Run: `pnpm test:run src/app/reportState.test.ts src/domain/qa.test.ts`

### Task 3: Select a phase destination before drawer assignment

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `e2e/demo.spec.ts`

**Interfaces:**
- `activePhotoTarget: { sectionId: string; phase: Phase } | null` lives in `App`.
- `UnmatchedCard` receives `onAssign(photoId)` and no destination controls.

- [x] **Step 1: Write a failing UI test that clicks AFTER, then assigns an unmatched photo into AFTER**
- [x] **Step 2: Run the targeted UI test and verify it fails because the active target is absent**

Run: `pnpm test:run src/App.test.tsx`

- [x] **Step 3: Add active-phase visual selection, destination summary, and drawer photo-click assignment**
- [x] **Step 4: Run the UI test and verify it passes**

Run: `pnpm test:run src/App.test.tsx`

### Task 4: Render condition tables and report summaries

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/pdf/exportReport.ts`
- Modify: `src/pdf/exportReport.test.ts`

**Interfaces:**
- Consumes `deriveFoulingRating`, `deriveObservedRating`, and `formatConditionSummary`.
- `PhasePanel` shows Fouling and Observed table groups with read-only rating badges.

- [x] **Step 1: Write a failing UI/PDF test for derived rating display and condition summary**
- [x] **Step 2: Run targeted tests and verify failure**

Run: `pnpm test:run src/App.test.tsx src/pdf/exportReport.test.ts`

- [x] **Step 3: Replace flat controls and legacy summaries with table controls and compact summaries**
- [x] **Step 4: Run targeted tests and verify they pass**

Run: `pnpm test:run src/App.test.tsx src/pdf/exportReport.test.ts`

### Task 5: Verify and publish

**Files:**
- Modify if needed: `e2e/demo.spec.ts`

- [x] **Step 1: Run all lint, type, unit, E2E, and portable-build checks**

Run: `pnpm lint; pnpm exec tsc --noEmit; pnpm test:run; pnpm build:portable; pnpm exec playwright test`

- [ ] **Step 2: Commit the implementation and push `main`**
- [ ] **Step 3: Confirm GitHub Pages serves the new bundle**
