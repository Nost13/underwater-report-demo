# Section Phase Reset and Word Template Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset the active photo phase whenever the active Section changes and render the Report Check preview with the same A4 page model and template structure as the Word export.

**Architecture:** App owns one Section focus function that updates both reducer focus and active photo phase, so every navigation route observes the same rule. Report Check derives `WordPhasePage[]` from `buildWordPhasePages()` and renders a dedicated template-shaped page component for the active Section instead of using the combined `selectedPages()` cards.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, CSS, existing DOCX report model

**Spec:** `docs/superpowers/specs/2026-08-24-section-reset-template-preview-design.md`

## Global Constraints

- Keep all report and photo data local to the browser.
- Preserve the existing Word template and its font settings.
- Normal work uses BEFORE/AFTER; Inspection uses CURRENT.
- First Word page capacity is 4 photos and continuation capacity is 6 photos.
- Empty preview photo slots display `N/A`.
- Preview and Word export must consume the same `buildWordPhasePages()` result shape.

---

### Task 1: Reset Photo Phase on Section Change

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ReportSection.phases: Phase[]`
- Produces: `focusReportSection(sectionId: string): void`, which focuses the reducer Section and selects `section.phases[0]`

- [ ] **Step 1: Write the failing navigation regression test**

Add a Testing Library test that selects AFTER in a Cleaning Section, clicks `다음 Section`, and expects `현재 사진 배정 위치` and `BEFORE 사진 갤러리` to indicate BEFORE.

- [ ] **Step 2: Run the focused test and verify the current implementation fails**

Run: `npm test -- src/App.test.tsx -t "resets the photo target to the first phase when moving to another Section"`

Expected: FAIL because the new Cleaning Section still has AFTER selected.

- [ ] **Step 3: Centralize Section focus in App**

Add a function with this behavior:

```ts
const focusReportSection = (sectionId: string) => {
  const nextSection = report.sections.find((section) => section.id === sectionId);
  if (!nextSection) return;
  dispatch({ type: 'FOCUS_SECTION', sectionId });
  setActivePhotoPhase(nextSection.phases[0]);
};
```

Pass it to Report Input and Report Check, and replace direct Section focus dispatches in those navigation paths.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/App.test.tsx -t "resets the photo target to the first phase when moving to another Section"`

Expected: PASS.

### Task 2: Render the Actual Word Page Structure in Preview

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `buildWordPhasePages(sections, photos, reportLabels): WordPhasePage[]`
- Consumes: `WordPhasePage.values` for BC, title, work, fouling and observed fields
- Produces: A4 portrait `article[aria-label="Word template preview page N"]` elements for the active Section

- [ ] **Step 1: Write the failing template preview test**

Add a test that creates sample photos, opens Check / Preview, and asserts the active preview page contains `7. DETAILED SERVICE RECORD`, `WORK PERFORM`, both Condition table headings, the active page title, and exactly four first-page photo slots.

- [ ] **Step 2: Run the focused test and verify the simplified preview fails**

Run: `npm test -- src/App.test.tsx -t "renders the active Section with the Word template page structure"`

Expected: FAIL because the current landscape card does not render the Word template structure.

- [ ] **Step 3: Replace selected preview pages with WordPhasePage data**

Inside CheckPreview, derive and filter pages using:

```ts
const wordPages = buildWordPhasePages(
  props.report.sections,
  props.report.photos,
  props.report.reportLabels,
).filter((page) => page.section.id === props.activeSection.id);
```

Remove the `pages` prop from CheckPreview and pass `vesselName` for the template header.

- [ ] **Step 4: Implement the first and continuation page markup**

Render the shared report header, `7. DETAILED SERVICE RECORD`, BC and side label. For `kind === 'first'`, render title/work, location diagram, Condition tables, and four slots. For continuation pages, render six slots. Fill unused slots with a gray placeholder and `N/A`.

- [ ] **Step 5: Implement the Word rating color mapping and A4 CSS**

Map ratings to the existing Word colors:

```ts
const ratingTone = (rating: string) => `rating-${rating.replace(/\D/g, '') || 'empty'}`;
```

Use A4 portrait `aspect-ratio: 210 / 297`, template-isolated font sizes, 2×2 first-page and 2×3 continuation grids, and compact responsive scaling within the preview canvas.

- [ ] **Step 6: Run focused and model tests**

Run: `npm test -- src/App.test.tsx src/docx/reportModel.test.ts`

Expected: PASS with no failed tests.

### Task 3: Full Verification and Deployment

**Files:**
- Modify only if verification exposes a regression.

**Interfaces:**
- Consumes: built application and GitHub Pages workflow
- Produces: verified public deployment

- [ ] **Step 1: Run the complete unit suite**

Run: `npm run test:run`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint and both production builds**

Run: `npm run lint`

Run: `npm run build`

Run: `npm run build:portable`

Expected: all commands exit with code 0.

- [ ] **Step 3: Verify in a 1440px browser viewport**

Open the built or development site, select AFTER, navigate to the next Section, confirm BEFORE is active, then open Check / Preview and confirm the A4 template layout, rating colors, photo slots and scroll behavior.

- [ ] **Step 4: Commit and push the verified change**

Stage only the files from this plan, commit with `feat: align preview with Word template`, and push to the configured GitHub Pages branch.

- [ ] **Step 5: Verify the public deployment**

Open `https://nost13.github.io/underwater-report-demo/` and repeat the Section reset and template preview checks against the deployed build.
