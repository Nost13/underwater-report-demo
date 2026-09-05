# Report Editing Cover and Word Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the browser report workflow, add cover authoring, and export a template-faithful Word report in the order `COVER -> 1-4 -> 5 -> 6 -> 7 -> 8`.

**Architecture:** Keep the existing reducer-driven web editor as the single source of truth. Add focused pure helpers for cover data, photo ordering/captions, and OOXML run replacement; keep each template writer responsible only for its own source DOCX; assemble the filled packages in the existing final exporter without rebuilding untouched template structures.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 4, Testing Library, JSZip, Canvas APIs, Vite portable build, Microsoft Word/Poppler render QA, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-05-report-editing-word-fidelity-design.md`

## Global Constraints

- Preserve the supplied template fonts, fixed tables, shapes, logos, page geometry, and all unrelated package parts.
- Preserve Job No. capitalization entered by the operator; do not lowercase or title-case it.
- Work Window format is `16 Hours + 1 Hrs`; Working Time format is `0 Hrs 49 Min`.
- Section 4 has exactly two Toolbox photos and exactly two Preparation photos.
- Missing Summary components remain blank in the existing matrix; Fin Blade is excluded from Summary only.
- Work Performed is uppercase `MAIN WORK | PHASE`; the separator run is raised 1 pt with `<w:position w:val="2"/>`.
- Supplemental photo captions use `BASE | SUPPLEMENTAL`; omit the second separator and text when supplemental text is blank.
- Web-only vessel-editor margins, handles, labels, and guide lines must not appear in the Word composition.
- The cover is exactly one first page and uses the supplied `cover.docx` as its visual authority.
- Do not introduce a permanent imported-photo deletion path; unassignment returns a photo to `미배정 사진`.
- Every behavior change follows test-first development and ends with a focused commit.

## File and Responsibility Map

- `src/app/reportInfo.ts`: operational derivation and Section 4 state/defaults.
- `src/app/ReportInformation.tsx`: two-row operational UI, Enter-to-select, and four readiness photo slots.
- `src/app/coverInfo.ts`: cover state, defaults, linked-value formatting, and generated scope text.
- `src/app/CoverEditor.tsx`: cover image/crop editor and fixed-ratio preview.
- `src/domain/types.ts`: photo caption and structured Work Performed types.
- `src/domain/photos.ts`: folder context, deterministic ordering, and caption composition.
- `src/app/reportState.ts`: photo caption, reorder, unassign, and work-label actions.
- `src/docx/ooxmlText.ts`: template-preserving multiline and raised-separator run utilities.
- `src/docx/section14Writer.ts`: Sections 1-4 fields and readiness photos.
- `src/docx/templateWriter.ts`: Detail pages, final package order, download name, and dependency wiring.
- `src/docx/coverWriter.ts`: patch only the approved cover text/image slots.
- `src/browser/coverImage.ts`: fixed-aspect cover-fill crop rendering.
- `src/docx/summaryWriter.ts`: preserve the supplied Section 5 page while filling values.
- `src/vesselDiagram/composer.ts`: Word-ratio composition and safe whitespace trimming.
- `src/app/VesselDiagramPreview.tsx`: preview the exact Word composition ratio.
- `src/App.tsx`: nine-stage orchestration and export input wiring.
- `src/styles.css`: existing-design visual states for new controls.
- `public/templates/cover.docx`: immutable runtime copy of the supplied cover template.

---

### Task 1: Operational formats and readiness data

**Files:**
- Modify: `src/app/reportInfo.ts`
- Modify: `src/app/reportInfo.test.ts`

**Interfaces:**
- Produces: `formatWorkWindow(start: string, end: string): string`
- Produces: `formatWorkingTime(start: string, end: string): string`
- Produces: `ReadinessInfo` with `toolboxPhotos` and `preparationPhotos`, each `[File | null, File | null]`
- Consumes later: `ReportInformation`, `section14Writer`, and `coverInfo`

- [ ] **Step 1: Write failing duration and default-note tests**

```ts
it('adds the fixed one-hour allowance to the whole-hour work window', () => {
  expect(formatWorkWindow('2026-09-01T01:36', '2026-09-01T18:00'))
    .toBe('16 Hours + 1 Hrs');
});

it('formats working time with exact hours and minutes', () => {
  expect(formatWorkingTime('2026-09-01T15:35', '2026-09-01T16:24'))
    .toBe('0 Hrs 49 Min');
});

it('creates exact readiness defaults and two empty slots per record', () => {
  expect(emptyReportInfo().readiness).toMatchObject({
    toolboxNote: 'No safety concerns noted before operation .',
    preparationNote: 'No abnormal conditions observed at site.',
    toolboxPhotos: [null, null],
    preparationPhotos: [null, null],
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm test:run src/app/reportInfo.test.ts`

Expected: FAIL because the exported formatters and readiness photo slots do not exist.

- [ ] **Step 3: Implement exact formatters and defaults**

```ts
export type ReadinessPhotoSlots = [File | null, File | null];

export interface ReadinessInfo {
  toolboxTime: string;
  toolboxNote: string;
  preparationTime: string;
  preparationNote: string;
  toolboxPhotos: ReadinessPhotoSlots;
  preparationPhotos: ReadinessPhotoSlots;
}

export function formatWorkWindow(start: string, end: string): string {
  const minutes = elapsedMinutes(start, end);
  return minutes === null ? '' : `${Math.floor(minutes / 60)} Hours + 1 Hrs`;
}

export function formatWorkingTime(start: string, end: string): string {
  const minutes = elapsedMinutes(start, end);
  return minutes === null ? '' : `${Math.floor(minutes / 60)} Hrs ${minutes % 60} Min`;
}
```

Use `formatWorkWindow` only for ETA/ETD and `formatWorkingTime` only for Start/End. Preserve the current rule that an invalid pair does not overwrite a manually edited derived value.

- [ ] **Step 4: Run report-info tests**

Run: `pnpm test:run src/app/reportInfo.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/reportInfo.ts src/app/reportInfo.test.ts
git commit -m "feat: format report operation times and readiness defaults"
```

---

### Task 2: Cover state and generated scope

**Files:**
- Create: `src/app/coverInfo.ts`
- Create: `src/app/coverInfo.test.ts`

**Interfaces:**
- Produces: `CoverInfo`, `CoverCrop`, `createCoverInfo`, `syncGeneratedCoverScope`, `linkedCoverValues`
- Consumes: `ReportInfo`, `ReportSection[]`
- Consumed later by: `CoverEditor`, `coverWriter`, `App`

- [ ] **Step 1: Write failing cover-state tests**

```ts
it('links report metadata without duplicating it into editable cover state', () => {
  const info = emptyReportInfo();
  info.vessel = { ...info.vessel, jobNo: 'US-CLS-2609003', name: 'MSC BEIJING VIII', imo: '9289099', callSign: 'CQEG5', ownerClient: 'MSC' };
  info.operation = { ...info.operation, start: '2026-09-04T08:00', eta: '2026-09-04T06:00', location: 'Busan Newport Pier 6' };
  expect(linkedCoverValues(info)).toEqual(expect.objectContaining({
    reportNo: 'US-CLS-2609003',
    vesselName: 'MSC BEIJING VIII',
    operationDate: '4 Sep 2026',
    location: 'Busan Newport Pier 6',
  }));
});

it('does not overwrite manually edited scope until regeneration is requested', () => {
  const manual = { ...createCoverInfo(new Date('2026-09-05')), scopeTitle: 'CUSTOM', scopeMode: 'MANUAL' as const };
  expect(syncGeneratedCoverScope(manual, [ropeRemovalSection])).toBe(manual);
  expect(syncGeneratedCoverScope(manual, [ropeRemovalSection], true).scopeTitle)
    .toBe('Removal of Entanglement Rope & Fishing Net');
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test:run src/app/coverInfo.test.ts`

Expected: FAIL because `coverInfo.ts` does not exist.

- [ ] **Step 3: Implement the cover model**

```ts
export interface CoverCrop {
  focusX: number;
  focusY: number;
  zoom: number;
}

export interface CoverInfo {
  issueDate: string;
  photoFile: File | null;
  crop: CoverCrop;
  scopeTitle: string;
  scopeDescription: string;
  scopeMode: 'AUTO' | 'MANUAL';
}

export function createCoverInfo(now = new Date()): CoverInfo {
  return {
    issueDate: localIsoDate(now),
    photoFile: null,
    crop: { focusX: 0.5, focusY: 0.5, zoom: 1 },
    scopeTitle: '',
    scopeDescription: '',
    scopeMode: 'AUTO',
  };
}
```

Generate stable service/component wording from matrix-ordered sections. Deduplicate repeated side/unit entries. Use Start date, then ETA date, then blank for the linked operation date.

- [ ] **Step 4: Run cover-model tests**

Run: `pnpm test:run src/app/coverInfo.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/coverInfo.ts src/app/coverInfo.test.ts
git commit -m "feat: model cover fields and generated scope"
```

---

### Task 3: Photo state, folder labels, captions, and ordering

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/photos.ts`
- Modify: `src/domain/photos.test.ts`
- Modify: `src/app/reportState.ts`
- Modify: `src/app/reportState.test.ts`
- Modify: all existing photo fixtures under `src/**/*.test.ts`

**Interfaces:**
- Produces: `PhotoData.captionText: string`
- Produces: `photoFolderContext(relativePath: string): string`
- Produces: `composePhotoCaption(base: string, phase: Phase, supplemental: string): string[]`
- Produces actions: `UPDATE_PHOTO_CAPTION`, `REORDER_PHOTO`, `UNASSIGN_PHOTO`
- Removes UI dependence on: `DELETE_PHOTO`

- [ ] **Step 1: Write failing pure-helper tests**

```ts
expect(photoFolderContext('1/2/3/image.jpg')).toBe('2 > 3');
expect(photoFolderContext('image.jpg')).toBe('선택한 폴더 바로 아래');
expect(composePhotoCaption('Sea Chest', 'BEFORE', '')).toEqual(['Sea Chest', 'Before']);
expect(composePhotoCaption('Sea Chest', 'BEFORE', 'Port inlet')).toEqual(['Sea Chest', 'Before', 'Port inlet']);
```

- [ ] **Step 2: Write failing reducer tests**

```ts
it('returns an assigned photo to unmatched without losing its file or path', () => {
  const next = reportReducer(seeded, { type: 'UNASSIGN_PHOTO', photoId: assigned.id });
  expect(next.photos[0]).toMatchObject({ sectionId: null, phase: null, relativePath: assigned.relativePath });
  expect(next.photos[0].file).toBe(assigned.file);
});

it('reorders only inside one section and phase and normalizes order', () => {
  const next = reportReducer(seeded, { type: 'REORDER_PHOTO', photoId: 'p3', beforePhotoId: 'p1' });
  expect(next.photos.filter(sameGroup).sort(byOrder).map((photo) => photo.id)).toEqual(['p3', 'p1', 'p2']);
  expect(next.photos.filter(sameGroup).sort(byOrder).map((photo) => photo.order)).toEqual([0, 1, 2]);
});

it('rejects a drop target in another phase', () => {
  expect(reportReducer(seeded, { type: 'REORDER_PHOTO', photoId: 'before', beforePhotoId: 'after' })).toBe(seeded);
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run: `pnpm test:run src/domain/photos.test.ts src/app/reportState.test.ts`

Expected: FAIL for missing properties, helpers, and actions.

- [ ] **Step 4: Implement immutable ordering and caption updates**

```ts
export interface PhotoData {
  id: string;
  sectionId: string | null;
  phase: Phase | null;
  file: File;
  reportUse: boolean;
  order: number;
  relativePath: string;
  captionText: string;
}

type PhotoEditingAction =
  | { type: 'UPDATE_PHOTO_CAPTION'; photoId: string; value: string }
  | { type: 'REORDER_PHOTO'; photoId: string; beforePhotoId: string | null }
  | { type: 'UNASSIGN_PHOTO'; photoId: string };
```

On assignment, give the photo the next order in the destination group. On unassignment, retain `File`, `relativePath`, `captionText`, and `reportUse`. Update every constructor/fixture to initialize `captionText: ''`.

- [ ] **Step 5: Run all domain and reducer tests**

Run: `pnpm test:run src/domain src/app/reportState.test.ts src/docx/reportModel.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain src/app/reportState.ts src/app/reportState.test.ts src/docx/reportModel.test.ts src/App.test.tsx src/app/demoData.ts
git commit -m "feat: support photo captions reorder and unassignment"
```

---

### Task 4: Photo assignment user interface

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Modify: `src/domain/qa.ts`
- Modify: `src/domain/qa.test.ts`

**Interfaces:**
- Consumes: `photoFolderContext`, `UPDATE_PHOTO_CAPTION`, `REORDER_PHOTO`, `UNASSIGN_PHOTO`
- Produces: thumbnail-based `미배정 사진` drawer and same-phase drag reorder

- [ ] **Step 1: Write failing interaction tests**

```tsx
expect(screen.getByRole('button', { name: /미배정 사진 1/ })).toBeVisible();
expect(screen.getByText('2 > 3')).toBeVisible();
await user.click(screen.getByRole('button', { name: /image.jpg 미배정으로 이동/ }));
expect(screen.getByRole('button', { name: /미배정 사진 1/ })).toBeEnabled();
await user.type(screen.getByLabelText('image.jpg 추가 캡션'), 'Port inlet');
expect(screen.getByText(/Port inlet/)).toBeVisible();
```

Use `fireEvent.dragStart` and `fireEvent.drop` to assert that dropping `p3` on `p1` changes visible order and dispatches a same-phase reorder.

- [ ] **Step 2: Run the App tests and verify failure**

Run: `pnpm test:run src/App.test.tsx src/domain/qa.test.ts`

Expected: FAIL because labels, folder context, caption input, and drag behavior are missing.

- [ ] **Step 3: Implement the UI without changing the established design system**

```tsx
<button className="unmatched-trigger" aria-label={`미배정 사진 ${unmatched.length}`}>
  <span>미배정 사진</span><b>{unmatched.length}</b>
</button>

<article draggable onDragStart={startDrag} onDragOver={allowDrop} onDrop={dropBefore}>
  <button className="photo-drag-handle" aria-label={`${photo.file.name} 순서 이동`}>⋮⋮</button>
  <input aria-label={`${photo.file.name} 추가 캡션`} value={photo.captionText} onChange={updateCaption} />
  <button aria-label={`${photo.file.name} 미배정으로 이동`} onClick={unassign}>미배정으로 이동</button>
</article>
```

Keep the existing move-to-section controls. Add drag-source and drop-target styling with the current navy/teal palette. Change QA copy from `UNMATCHED` to `미배정 사진`.

- [ ] **Step 4: Run App and QA tests**

Run: `pnpm test:run src/App.test.tsx src/domain/qa.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css src/domain/qa.ts src/domain/qa.test.ts
git commit -m "feat: improve photo assignment and ordering workflow"
```

---

### Task 5: Report Information interface and Section 4 photo slots

**Files:**
- Modify: `src/app/ReportInformation.tsx`
- Modify: `src/app/ReportInformation.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `deriveOperationValues`, `ReadinessPhotoSlots`
- Produces: structured Vessel Schedule and Operation Record rows; exact four-slot readiness editor

- [ ] **Step 1: Write failing Enter-selection and layout tests**

```tsx
await user.type(screen.getByLabelText('Diver search'), 'kim{enter}');
expect(screen.getByRole('table', { name: '선택한 자격 인원' })).toHaveTextContent('KIM');

expect(screen.getByRole('group', { name: 'VESSEL SCHEDULE' })).toBeVisible();
expect(screen.getByRole('group', { name: 'OPERATION RECORD' })).toBeVisible();
expect(screen.getByLabelText('Work Window')).toHaveValue('16 Hours + 1 Hrs');
expect(screen.getByLabelText('Working Time')).toHaveValue('0 Hrs 49 Min');
```

- [ ] **Step 2: Write failing readiness-photo tests**

Upload three files to the Toolbox input and assert only the first two slots are retained. Replace slot 1 and clear slot 2. Repeat the assertions for Preparation.

- [ ] **Step 3: Run focused component tests and verify failure**

Run: `pnpm test:run src/app/ReportInformation.test.tsx`

Expected: FAIL for Enter handling, group structure, and photo-slot controls.

- [ ] **Step 4: Implement the two operational rows and slot editor**

```tsx
<fieldset className="operation-record-row" aria-label="VESSEL SCHEDULE">
  <legend>VESSEL SCHEDULE</legend>
  {scheduleFields.map(renderOperationField)}
</fieldset>
<fieldset className="operation-record-row" aria-label="OPERATION RECORD">
  <legend>OPERATION RECORD</legend>
  {recordFields.map(renderOperationField)}
</fieldset>
```

Handle `onKeyDown` on Diver search: prevent default and call `addPersonnel(diverResults[0])` only when `event.key === 'Enter'` and a first result exists. Build a reusable two-slot renderer inside this component for Toolbox and Preparation.

- [ ] **Step 5: Run component tests**

Run: `pnpm test:run src/app/ReportInformation.test.tsx src/app/reportInfo.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/ReportInformation.tsx src/app/ReportInformation.test.tsx src/styles.css
git commit -m "feat: structure report information and readiness photos"
```

---

### Task 6: Cover image rendering and Cover editor

**Files:**
- Create: `src/browser/coverImage.ts`
- Create: `src/browser/coverImage.test.ts`
- Create: `src/app/CoverEditor.tsx`
- Create: `src/app/CoverEditor.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `renderCoverPhoto(file: File, crop: CoverCrop, target?: { width: number; height: number }): Promise<Uint8Array>`
- Consumes: `CoverInfo`, `linkedCoverValues`, `syncGeneratedCoverScope`
- Produces: cover file picker, focus drag, zoom range, and fixed A4 preview

- [ ] **Step 1: Write failing crop-geometry tests**

```ts
expect(coverSourceRect(1200, 800, { focusX: 0.5, focusY: 0.5, zoom: 1 }, 1600, 800))
  .toEqual({ x: 0, y: 100, width: 1200, height: 600 });
expect(coverSourceRect(1200, 800, { focusX: 1, focusY: 0.5, zoom: 2 }, 1600, 800).x)
  .toBe(600);
```

- [ ] **Step 2: Write failing Cover editor tests**

Assert selecting a file shows a preview, zoom updates `crop.zoom`, pointer movement clamps focus to `0..1`, manual scope editing sets `scopeMode` to `MANUAL`, and `자동 내용 다시 적용` restores generated scope.

- [ ] **Step 3: Run cover tests and verify failure**

Run: `pnpm test:run src/browser/coverImage.test.ts src/app/CoverEditor.test.tsx`

Expected: FAIL because the renderer and editor do not exist.

- [ ] **Step 4: Implement cover-fill rendering and preview**

```ts
export function coverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  crop: CoverCrop,
  targetWidth: number,
  targetHeight: number,
): PixelRect {
  const baseScale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const visibleWidth = targetWidth / (baseScale * crop.zoom);
  const visibleHeight = targetHeight / (baseScale * crop.zoom);
  return clampFocusedRect(sourceWidth, sourceHeight, visibleWidth, visibleHeight, crop.focusX, crop.focusY);
}
```

Use CSS `object-fit: cover`, `object-position`, and a transform matching the saved crop for the browser preview. Preserve the existing navy/teal cards, buttons, and typography.

- [ ] **Step 5: Run cover tests**

Run: `pnpm test:run src/browser/coverImage.test.ts src/app/CoverEditor.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/browser/coverImage.ts src/browser/coverImage.test.ts src/app/CoverEditor.tsx src/app/CoverEditor.test.tsx src/styles.css
git commit -m "feat: add editable cover preview"
```

---

### Task 7: Nine-stage workflow and cover state wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `CoverEditor`, `CoverInfo`, `createCoverInfo`, `syncGeneratedCoverScope`
- Produces: stage order `Vessel / Scope -> Report Information -> Cover -> Vessel Diagram -> 사진 폴더 -> Report Input -> Check / Preview -> Summary -> Word`

- [ ] **Step 1: Write failing navigation tests**

```tsx
expect(stageLabels()).toEqual([
  'Vessel / Scope', 'Report Information', 'Cover', 'Vessel Diagram',
  '사진 폴더', 'Report Input', 'Check / Preview', 'Summary', 'Word',
]);
```

Navigate forward and back across Report Information, Cover, and Vessel Diagram. Assert scope changes update auto cover text and do not overwrite manual cover text.

- [ ] **Step 2: Run App tests and verify failure**

Run: `pnpm test:run src/App.test.tsx`

Expected: FAIL because Cover is not a stage and export has no cover state.

- [ ] **Step 3: Wire the stage and state**

```tsx
const [coverInfo, setCoverInfo] = useState(() => createCoverInfo());

{stage === 2 && (
  <CoverEditor
    value={coverInfo}
    reportInfo={reportInfo}
    sections={report.sections}
    onChange={setCoverInfo}
    onBack={() => setStage(1)}
    onNext={() => setStage(3)}
  />
)}
```

Shift all later stage indexes consistently, including error redirects, Summary edit actions, progress navigation, and preview/export callbacks.

- [ ] **Step 4: Run App tests**

Run: `pnpm test:run src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: add cover to the report workflow"
```

---

### Task 8: Template-preserving OOXML text and Section 1-4 output

**Files:**
- Create: `src/docx/ooxmlText.ts`
- Create: `src/docx/ooxmlText.test.ts`
- Modify: `src/docx/section14Writer.ts`
- Modify: `src/docx/section14Writer.test.ts`
- Modify: `src/browser/images.ts`
- Modify: `src/browser/images.test.ts`

**Interfaces:**
- Produces: `setElementTextPreservingRun`, `setCellLines`, `setSeparatedRuns`
- Produces: `resizeForReportSlot(file: File, width: number, height: number): Promise<Uint8Array>`
- Extends: `fillSection14Template(input, dependencies)` with `resizePhoto`
- Consumes: four readiness photo slots

- [ ] **Step 1: Write failing OOXML utility tests**

```ts
setCellLines(cell, ['01 Sep 2026,', '01:36']);
expect(text(cell)).toBe('01 Sep 2026,01:36');
expect(cell.getElementsByTagNameNS('*', 'br')).toHaveLength(1);
expect(serializedFirstRunProperties(cell)).toBe(originalRunProperties);

setSeparatedRuns(paragraph, ['ROPE REMOVAL', 'BEFORE']);
expect(separatorRun(paragraph).querySelector('*|position')?.getAttributeNS(WORD_NS, 'val')).toBe('2');
```

Add a browser-image test proving a portrait and a landscape source are center-cropped to a requested slot ratio without stretching, and that the output canvas has the requested pixel dimensions.

- [ ] **Step 2: Write failing Section 1-4 integration tests**

Use `public/templates/section1_4_template.docx`. Assert:

- ETA/ETD/Start/End use one paragraph with one `<w:br/>` and no trailing empty paragraph;
- `Work Window` and `Working Time` match the web values exactly;
- the two existing Toolbox and two existing Preparation drawings receive the selected image relationships;
- target row/table sizes, `styles.xml`, and original value-run font properties are unchanged;
- Job No. remains `US-CLS-2608007`.

- [ ] **Step 3: Run tests and verify failure**

Run: `pnpm test:run src/docx/ooxmlText.test.ts src/browser/images.test.ts src/docx/section14Writer.test.ts`

Expected: FAIL for missing utilities, line breaks, and readiness pictures.

- [ ] **Step 4: Implement local OOXML patches**

Clone the first existing run's `<w:rPr>` when adding text or breaks. Implement `resizeForReportSlot` with a center-crop source rectangle and a fixed output canvas. The source template already has two picture drawings in row 2 of `TOOLBOX MEETING & LOTO` and two in row 2 of `PREPARATION ON SITE`; replace only those four `r:embed` relationships and media parts. Use a white replacement image for an empty slot so sample photos cannot survive. Do not add drawings or change row heights, extents, table widths, or cell structure. Use the fixed-slot image renderer through an injected dependency for tests.

```ts
export interface Section14WriterDependencies {
  fetchTemplate?: () => Promise<ArrayBuffer | Uint8Array>;
  resizePhoto?: (file: File, width: number, height: number) => Promise<Uint8Array>;
}
```

- [ ] **Step 5: Run Section 1-4 tests**

Run: `pnpm test:run src/docx/ooxmlText.test.ts src/browser/images.test.ts src/docx/section14Writer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/docx/ooxmlText.ts src/docx/ooxmlText.test.ts src/browser/images.ts src/browser/images.test.ts src/docx/section14Writer.ts src/docx/section14Writer.test.ts
git commit -m "feat: fill operational and readiness Word sections"
```

---

### Task 9: Detail Work Performed, captions, and fixed photo slots

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/app/workPerformLabels.ts`
- Modify: `src/app/workPerformLabels.test.ts`
- Modify: `src/app/reportState.ts`
- Modify: `src/docx/reportModel.ts`
- Modify: `src/docx/reportModel.test.ts`
- Modify: `src/docx/templateWriter.ts`
- Modify: `src/docx/templateWriter.test.ts`
- Modify: `src/docx/templateWriter.integration.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Changes: `WorkPerformLabelMap = Record<string, { main: string; phase: string }>`
- Produces: `defaultWorkPerformed(section: ReportSection): string`
- Produces action: `UPDATE_WORK_PERFORM_LABEL` with `field: 'main' | 'phase'`
- Consumes: `setSeparatedRuns`, `composePhotoCaption`
- Consumes: `resizeForReportSlot(file: File, width: number, height: number): Promise<Uint8Array>`

- [ ] **Step 1: Write failing label-model tests**

```ts
expect(defaultWorkPerformed(ropeGuardRemoval)).toBe('ROPE REMOVAL');
expect(initializeWorkPerformLabels([ropeGuardRemoval])[key]).toEqual({
  main: 'ROPE REMOVAL',
  phase: 'BEFORE',
});
```

- [ ] **Step 2: Write failing Detail OOXML tests**

Create one photo without supplemental text and one with `captionText: 'Port inlet'`. Assert:

- heading text is `WORK PERFORMED ROPE REMOVAL | BEFORE`;
- both Work Performed and caption separator runs contain `<w:position w:val="2"/>`;
- caption without extra text has only `Sea Chest | Before`;
- caption with extra text has `Sea Chest | Before | Port inlet`;
- the original caption run font properties are preserved;
- drawing extent and table/row dimensions are unchanged.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `pnpm test:run src/app/workPerformLabels.test.ts src/docx/reportModel.test.ts src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts`

Expected: FAIL because labels are strings and separators are not dedicated raised runs.

- [ ] **Step 4: Implement structured labels and per-photo captions**

```ts
export interface WorkPerformLabel {
  main: string;
  phase: string;
}

export type WorkPerformLabelMap = Record<string, WorkPerformLabel>;
```

Replace the template's `WORK PERFORM` label text with `WORK PERFORMED` while preserving its existing run properties, then write the uppercase main/phase value with `setSeparatedRuns`. In the photo loop, compute the base from `page.values.photoCaption` and `page.phase`, append trimmed `photo.captionText` only when non-empty, and use the same run utility.

Render each Detail photo with `resizeForReportSlot` at the exact aspect ratio of `PHOTO_WIDTH_EMU / PHOTO_HEIGHT_EMU` before inserting it. Keep the existing drawing extent and table dimensions; the bitmap crop provides cover-fill without distortion or table growth. Reuse the same fixed-aspect renderer for Section 4 slots with each readiness slot's measured aspect ratio.

Update the web label dialog to expose `작업명` and `단계 문구` separately. Keep the main value generated until the operator edits it.

- [ ] **Step 5: Run Detail and UI tests**

Run: `pnpm test:run src/app/workPerformLabels.test.ts src/docx/reportModel.test.ts src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts src/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/app/workPerformLabels.ts src/app/workPerformLabels.test.ts src/app/reportState.ts src/docx/reportModel.ts src/docx/reportModel.test.ts src/docx/templateWriter.ts src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: format detail work labels and photo captions"
```

---

### Task 10: Word-ratio vessel diagram and editor controls

**Files:**
- Modify: `src/vesselDiagram/composer.ts`
- Modify: `src/vesselDiagram/composer.test.ts`
- Modify: `src/app/VesselDiagramPreview.tsx`
- Modify: `src/app/VesselDiagramPreview.test.tsx`
- Modify: `src/app/VesselDiagramEditor.tsx`
- Modify: `src/app/VesselDiagramEditor.test.tsx`
- Modify: `src/styles.css`
- Modify: `src/docx/templateWriter.ts`
- Modify: `src/docx/templateWriter.integration.test.ts`

**Interfaces:**
- Produces: `WORD_DIAGRAM_WIDTH`, `WORD_DIAGRAM_HEIGHT`, and `composeVesselDiagram(config: VesselDiagramConfig, markerIds: string[], dependencies?: ComposeDependencies): Promise<Uint8Array>`
- Consumes: current marker geometry; emits only vessel image plus selected circular/rectangular markers

- [ ] **Step 1: Write failing composition-ratio tests**

Assert a wide source with whitespace is cropped to content, contained inside the exact Word ratio, retains all marker bounds, and leaves no editor callout labels or handles in the PNG. Assert circular markers remain circles after the output transform.

- [ ] **Step 2: Write failing editor and preview tests**

Assert:

- the Word placement preview uses the exported width/height ratio;
- the vessel-side image file picker remains visible in the editor;
- marker handles use the reduced CSS class;
- clicking a callout name selects its marker;
- callout names use their component labels and never the generic text `Aft services`;
- Ctrl+click toggles individual markers;
- `동일 크기` applies one reference circle size to selected non-Bilge-Keel markers;
- editor margins do not change stored normalized Word geometry.

- [ ] **Step 3: Run vessel tests and verify failure**

Run: `pnpm test:run src/vesselDiagram src/app/VesselDiagramEditor.test.tsx src/app/VesselDiagramPreview.test.tsx src/docx/templateWriter.integration.test.ts`

Expected: FAIL for the exact output ratio and remaining UI behavior.

- [ ] **Step 4: Implement a single Word composition path**

```ts
export const WORD_DIAGRAM_WIDTH = 1600;
export const WORD_DIAGRAM_HEIGHT = 381;

export interface ComposeDependencies {
  decodeImage?: (file: File) => Promise<ImageSource>;
  createCanvas?: (width: number, height: number) => CanvasLike | null;
  createImageBitmap?: (file: File) => Promise<ImageSource>;
  createObjectURL?: (file: File) => string;
  revokeObjectURL?: (url: string) => void;
  loadImage?: (url: string) => Promise<ImageSource>;
  outputWidth?: number;
  outputHeight?: number;
  trimOuterWhitespace?: boolean;
}
```

Use the same constants in the web Word preview and Detail export. Compute the crop from visible vessel/marker content with enough padding to prevent clipping. Do not serialize callout labels, handles, selection boxes, alignment guides, or web margins.

- [ ] **Step 5: Run vessel tests**

Run: `pnpm test:run src/vesselDiagram src/app/VesselDiagramEditor.test.tsx src/app/VesselDiagramPreview.test.tsx src/docx/templateWriter.integration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/vesselDiagram src/app/VesselDiagramEditor.tsx src/app/VesselDiagramEditor.test.tsx src/app/VesselDiagramPreview.tsx src/app/VesselDiagramPreview.test.tsx src/styles.css src/docx/templateWriter.ts src/docx/templateWriter.integration.test.ts
git commit -m "fix: align vessel diagram preview and Word placement"
```

---

### Task 11: Preserve the complete Section 5 template

**Files:**
- Modify: `src/summary/summaryModel.ts`
- Modify: `src/summary/summaryModel.test.ts`
- Modify: `src/docx/summaryWriter.ts`
- Modify: `src/docx/summaryWriter.integration.test.ts`

**Interfaces:**
- Consumes: final Detail conditions ordered by Finding Matrix
- Produces: one intact 5.1/5.2 overview page plus existing conditional detail pages without blank-page artifacts

- [ ] **Step 1: Write failing template-fidelity tests**

Using `public/templates/summary_template.docx`, record baseline counts and assert after filling:

```ts
expect(headings(output)).toContain('5.1 OVERALL RESULT');
expect(headings(output)).toContain('5.2 BIOFOULING CONDITION OVERVIEW');
expect(countLegendBlocks(output)).toBe(countLegendBlocks(template));
expect(countOverviewRows(output)).toBe(countOverviewRows(template));
expect(matrixCell(output, 'Bulbous Bow', 'Rating')).toBe('');
expect(matrixComponents(output)).not.toContain('Fin Blade');
expect(explicitBlankPageBreaks(output)).toHaveLength(0);
```

Add a coverage update assertion showing that changing Detail coverage changes Summary rating/type/coverage.

- [ ] **Step 2: Run Summary tests and verify failure**

Run: `pnpm test:run src/summary/summaryModel.test.ts src/docx/summaryWriter.integration.test.ts`

Expected: FAIL for the current broken page pruning or layout mutation.

- [ ] **Step 3: Restrict Summary writes to approved slots**

Retain the original first-page body sequence, overview diagram, legend, and 12-row matrix. Replace only headline/narrative text, diagram rating text/border colors, matrix rating/type/coverage cells, and intended condition-table cells. Never delete a matrix row or create a replacement table. Remove only explicit break-only paragraphs proven to sit outside retained pages.

- [ ] **Step 4: Run Summary tests**

Run: `pnpm test:run src/summary/summaryModel.test.ts src/docx/summaryWriter.integration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/summary/summaryModel.ts src/summary/summaryModel.test.ts src/docx/summaryWriter.ts src/docx/summaryWriter.integration.test.ts
git commit -m "fix: preserve the complete summary template"
```

---

### Task 12: Cover DOCX writer

**Template source:** `C:\Users\laz\OneDrive - (주) 언더워터솔루션 (US)\04. Operation\Ops_All\06. 현장작업(SITE)\03.2026\9월\260904_MSC BEIJING VIII\2. Photo Report\cover.docx`

**Files:**
- Create: `public/templates/cover.docx`
- Create: `src/docx/coverWriter.ts`
- Create: `src/docx/coverWriter.test.ts`
- Create: task-local template evidence under `.tmp-cover-template/` (not committed)

**Interfaces:**
- Produces: `fillCoverTemplate(input: CoverWriterInput, dependencies?: CoverWriterDependencies): Promise<Blob>`
- Consumes: `CoverInfo`, `ReportInfo`, `ReportSection[]`, `renderCoverPhoto`
- Preserves: grouped logo/header shapes, hero anchor and dimensions, bottom logos, footer, styles, and page geometry

- [ ] **Step 1: Distill and fingerprint the supplied cover template**

Use the Documents skill's template-distill workflow. Record SHA-256, one A4 section, 0.5-inch margins, all body/grouped shapes, table grids, image relationships, fonts, and editable slot paths. Render the source through Microsoft Word and inspect page 1 at 100%.

- [ ] **Step 2: Copy the approved template into runtime assets and write failing preservation tests**

The tests must assert:

- source and runtime copies have the same SHA-256 at copy time;
- exactly one page body and one section are retained;
- REPORT NO, DATE OF ISSUE, vessel metadata, operation date/location, and both scope lines are replaced;
- the largest floating-picture relationship contains rendered cover-photo bytes;
- missing photo uses a white image and never leaves the MSC BEIJING VIII sample;
- hero anchor position and extent are byte-identical;
- `styles.xml`, grouped logo shapes, lower logo row, and footer are unchanged.

- [ ] **Step 3: Run the cover writer test and verify failure**

Run: `pnpm test:run src/docx/coverWriter.test.ts`

Expected: FAIL because the writer and runtime template do not exist.

- [ ] **Step 4: Implement verified structural slot patching**

```ts
export interface CoverWriterInput {
  coverInfo: CoverInfo;
  reportInfo: ReportInfo;
  sections: ReportSection[];
  templateUrl: string;
}

export interface CoverWriterDependencies {
  fetchTemplate?: () => Promise<ArrayBuffer | Uint8Array>;
  renderPhoto?: typeof renderCoverPhoto;
}
```

Locate body table slots by their stable row/cell structure and label text. Locate top grouped text boxes by `REPORT NO :` and `DATE OF ISSUE :`. Locate the hero as the largest body floating picture, replace only its image relationship target, and retain its anchor XML. Patch existing text nodes so run properties remain unchanged.

- [ ] **Step 5: Run cover writer tests**

Run: `pnpm test:run src/docx/coverWriter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/templates/cover.docx src/docx/coverWriter.ts src/docx/coverWriter.test.ts
git commit -m "feat: fill the supplied cover template"
```

---

### Task 13: Final assembly, checks, and download name

**Files:**
- Modify: `src/docx/templateWriter.ts`
- Modify: `src/docx/templateWriter.test.ts`
- Modify: `src/docx/templateWriter.integration.test.ts`
- Modify: `src/domain/qa.ts`
- Modify: `src/domain/qa.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Extends: `WordExportInput` with `coverInfo` and `coverTemplateUrl`
- Produces: `buildReportFileName(jobNo: string, vesselName: string): string`
- Produces: final package order with one prepended cover body

- [ ] **Step 1: Write failing filename and assembly tests**

```ts
expect(buildReportFileName('US-CLS-2608007', 'MSC JAVELIN IX')).toBe(
  'US-CLS-2608007_MSC JAVELIN IX_Underwater service report(Detail).docx',
);
expect(topLevelHeadings(output)).toEqual(expect.arrayContaining([
  'UNDERWATER PHOTO REPORT',
  '1. GENERAL INFORMATION',
  '5. OVERALL SUMMARY',
  '6. ASSESSMENT GUIDELINES',
  '7. DETAILED SERVICE RECORD',
  '8. QUALIFICATION & CERTIFICATION RECORDS',
]));
expect(indexOfHeading(output, 'UNDERWATER PHOTO REPORT')).toBeLessThan(indexOfHeading(output, '1. GENERAL INFORMATION'));
expect(countHeading(output, 'UNDERWATER PHOTO REPORT')).toBe(1);
```

Assert invalid Windows filename characters are removed without changing case.

- [ ] **Step 2: Write failing cover QA tests**

Extend `checkReport` with optional cover/report inputs. Assert missing cover photo and missing linked metadata produce clear Korean pre-export issues but do not block `writeTemplateReport`.

- [ ] **Step 3: Run exporter tests and verify failure**

Run: `pnpm test:run src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts src/domain/qa.test.ts src/App.test.tsx`

Expected: FAIL because Cover is not filled or prepended and the filename is still vessel-only.

- [ ] **Step 4: Implement package prepending while retaining Section 1-4 as the base package**

Keep the Section 1-4 package as the merge base so existing report styles/headers remain authoritative. Generalize the package merger to import cover relationships and insert `coverBody + page break + section14Body` before existing appended Summary/Section 6/Detail/Section 8 bodies. Carry the cover section properties on the first-section break only when they differ; otherwise reuse the common A4 geometry.

```ts
const finalParts: PackagePart[] = [
  { blob: coverBlob, prefix: 'cover', placement: 'prepend' },
  { blob: section14Blob, prefix: 'section14', placement: 'base' },
  { blob: summaryBlob, prefix: 'summary', placement: 'append' },
  { blob: section6Blob, prefix: 'section6', placement: 'append' },
  { blob: detailBlob, prefix: 'detail', placement: 'append' },
  { blob: section8Blob, prefix: 'section8', placement: 'append' },
];
```

Pass `coverInfo`, `/templates/cover.docx`, readiness-photo resize dependency, Job No., and the final filename from `App`.

- [ ] **Step 5: Run exporter and App tests**

Run: `pnpm test:run src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts src/domain/qa.test.ts src/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/docx/templateWriter.ts src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts src/domain/qa.ts src/domain/qa.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: assemble and name the complete Word report"
```

---

### Task 14: Full verification, Word render QA, and deployment

**Files:**
- Modify only if verification exposes a defect.
- Produce QA artifacts under `artifacts/final-report-qa/` and keep them uncommitted unless the user requests them.

**Interfaces:**
- Verifies: browser workflow, all template writers, final DOCX, portable site, and public GitHub Pages deployment

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
pnpm test:run
pnpm lint
pnpm build:portable
```

Expected: every Vitest file passes, ESLint exits 0, and `dist-portable` is created successfully.

- [ ] **Step 2: Generate a representative final DOCX through the browser workflow**

Use a sample with:

- Job No. `US-CLS-2608007` and vessel `MSC JAVELIN IX`;
- ETA/ETD yielding `16 Hours + 1 Hrs`;
- Start/End yielding `0 Hrs 49 Min`;
- cover photo and edited scope;
- two Toolbox and two Preparation photos;
- Before/After Detail photos, one supplemental caption, a vessel diagram, and at least one blank Summary component.

Verify the downloaded name exactly matches `US-CLS-2608007_MSC JAVELIN IX_Underwater service report(Detail).docx`.

- [ ] **Step 3: Render every Word page and inspect at 100%**

Use Microsoft Word hidden export to PDF and Poppler to produce one PNG per page. Inspect every page for:

- exactly one cover first page;
- original cover/Section 1-4 fonts and chrome;
- no blank page between sections;
- two-line operational date cells with no empty line;
- four Section 4 photos;
- intact 5.1 and 5.2 layout and blank missing matrix cells;
- wide vessel image filling its fixed cell without marker clipping;
- uppercase Work Performed and raised separators;
- fixed photo tables and correct caption text;
- Section 8 selected personnel.

If any page fails, add a focused regression test, patch the smallest responsible writer/component, rerun its focused tests, regenerate the DOCX, and repeat the full render inspection.

- [ ] **Step 4: Run a local production browser check**

Serve `dist-portable`, load the complete nine-stage flow, confirm no console errors, verify responsive layouts at wide and narrow widths, and download one DOCX from the production build.

- [ ] **Step 5: Commit any verification fixes and the final implementation state**

```bash
git status --short
git add src
git commit -m "fix: pass final report generation verification"
```

Skip the commit when no verification fixes exist.

- [ ] **Step 6: Push and verify GitHub Pages**

Run:

```bash
git push origin main
gh run list --workflow deploy-pages.yml --limit 1
gh run watch <run-id> --exit-status
```

Expected: the deployment workflow completes successfully for the pushed commit.

- [ ] **Step 7: Verify the public site**

Open `https://nost13.github.io/underwater-report-demo/`, confirm its loaded build marker/asset belongs to the pushed commit, navigate through Cover and Report Information, verify `미배정 사진`, and confirm the final Word download action is enabled after required inputs.

- [ ] **Step 8: Report completion**

Provide the public URL, pushed commit, automated test totals, build result, Word page count, and any non-blocking warning. Do not claim completion unless the public deployment and rendered DOCX both pass.
