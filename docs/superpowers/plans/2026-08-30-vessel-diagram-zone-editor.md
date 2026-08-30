# Vessel Diagram and Zone Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-based vessel side-view calibration and zone-marker editor whose confirmed output is reused without drift in both Preview and the generated Word report.

**Architecture:** Introduce a focused vessel-diagram domain module for normalized geometry, automatic marker layout, canonical component resolution, and 2048×488 PNG composition. A dedicated React editor becomes the workflow stage between Scope and photo input; App owns the current in-memory configuration and clears it with Scope reset. Preview and the DOCX writer both consume the same resolver and compositor, while the writer replaces only the template's `vessel_profile` drawing relationship and removes legacy floating `zone_*` anchors.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, Playwright, browser Canvas/File APIs, JSZip, OOXML/DOCX, Vinext/Vite.

**Spec:** `docs/superpowers/specs/2026-08-30-vessel-diagram-zone-editor-design.md`

## Global Constraints

- Keep the fixed report-diagram composition canvas at exactly `2048 × 488` pixels.
- Store every guide and marker rectangle as normalized `0..1` coordinates; do not persist editor pixels.
- Side-view orientation is always stern-left and bow-right.
- Uploaded vessel images use `contain` fitting on white and are never stretched.
- The browser session is the only storage location; add no server persistence or upload endpoint.
- Hull calibration must be confirmed before Niche editing; changing confirmed Hull calibration recalculates Niche defaults after confirmation.
- Propeller Blade, Fin Blade, Stern Frame, Rope Guard, and Boss Cap share one Propeller marker.
- Sea Chest and Discharge Pipe share one AFT-services marker.
- Transducer and Anode / ICCP each render two linked markers: one stern and one bow.
- Bilge Keel marker count comes from Scope quantity, defaults to one, is evenly split around the calibrated vessel midpoint, and shares unit geometry between PORT and STBD.
- Preview and Word export must call the same `resolveMarkerIds` and `composeVesselDiagram` functions.
- Preserve the supplied Detail template's fonts, tables, text runs, photo slots, captions, header, footer, and existing `vessel_profile` inline extent.
- Flatten the side view and page-specific markers into PNG for Word; remove the template's floating `zone_*` shapes.
- Keep the established 1440px application width, visual language, and responsive behavior.

## File Structure

- `src/vesselDiagram/types.ts`: canonical constants and public diagram data types.
- `src/vesselDiagram/geometry.ts`: validation, clamping, projection, automatic Hull/Niche/Bilge layout.
- `src/vesselDiagram/markers.ts`: Scope-to-required-group derivation and canonical section-to-marker resolution.
- `src/vesselDiagram/composer.ts`: shared 2048×488 raster composition used by Preview and Word.
- `src/app/VesselDiagramEditor.tsx`: upload, Hull calibration, Niche calibration, selection, drag/resize/keyboard, reset, and confirmation UI.
- `src/app/VesselDiagramPreview.tsx`: object-URL lifecycle around the shared compositor.
- `src/App.tsx`: six-stage workflow ownership, diagram reset/export guards, and prop wiring.
- `src/docx/templateWriter.ts`: page-specific vessel PNG relationships and legacy anchor removal.
- `src/styles.css`: editor, stage, selection, responsive, and preview styling within the existing design tokens.

---

### Task 1: Define normalized geometry and automatic marker layout

**Files:**
- Create: `src/vesselDiagram/types.ts`
- Create: `src/vesselDiagram/geometry.ts`
- Create: `src/vesselDiagram/geometry.test.ts`

**Interfaces:**
- Produces `DIAGRAM_WIDTH`, `DIAGRAM_HEIGHT`, `NormalizedRect`, `HullCalibration`, `ZoneMarker`, `VesselDiagramConfig`, and `MarkerShape`.
- Produces `clampRect(rect): NormalizedRect`.
- Produces `isValidCalibration(calibration): boolean`.
- Produces `projectTemplateRect(rect, calibration): NormalizedRect`.
- Produces `createDefaultHullMarkers(calibration): ZoneMarker[]`.
- Produces `createDefaultNicheMarkers(calibration, bilgeQuantity): ZoneMarker[]`.
- Produces `createBilgeKeelMarkers(calibration, quantity): ZoneMarker[]`.
- Produces `resetMarker(markerId, calibration, bilgeQuantity): ZoneMarker | null`.

- [ ] **Step 1: Write failing normalized-geometry tests**

```ts
import {
  clampRect,
  createBilgeKeelMarkers,
  createDefaultHullMarkers,
  isValidCalibration,
  projectTemplateRect,
} from './geometry';

it('projects template-relative geometry through calibrated length and height', () => {
  expect(projectTemplateRect(
    { x: 0.25, y: 0.5, width: 0.2, height: 0.25 },
    { sternX: 0.1, bowX: 0.9, hullTopY: 0.2, bottomY: 0.8 },
  )).toEqual({ x: 0.3, y: 0.5, width: 0.16, height: 0.15 });
});

it('clamps both origin and extent to the canonical canvas', () => {
  expect(clampRect({ x: -0.1, y: 0.9, width: 1.4, height: 0.4 }))
    .toEqual({ x: 0, y: 0.9, width: 1, height: 0.1 });
});

it('rejects crossed Hull guides', () => {
  expect(isValidCalibration({ sternX: 0.8, bowX: 0.2, hullTopY: 0.1, bottomY: 0.9 }))
    .toBe(false);
});

it('creates Hull markers in stern-to-bow order', () => {
  expect(createDefaultHullMarkers({ sternX: 0.1, bowX: 0.9, hullTopY: 0.2, bottomY: 0.8 })
    .map((marker) => marker.id))
    .toEqual(['hull-aft', 'hull-mid-aft', 'hull-mid', 'hull-fwd-mid', 'hull-fwd']);
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-module failure**

Run: `pnpm vitest run src/vesselDiagram/geometry.test.ts`

Expected: FAIL because `types.ts` and `geometry.ts` do not exist.

- [ ] **Step 3: Implement the public types and canonical constants**

```ts
export const DIAGRAM_WIDTH = 2048;
export const DIAGRAM_HEIGHT = 488;

export type MarkerShape = 'RECTANGLE' | 'ELLIPSE';

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HullCalibration {
  sternX: number;
  bowX: number;
  hullTopY: number;
  bottomY: number;
}

export interface ZoneMarker {
  id: string;
  groupId: string;
  unit?: number;
  rect: NormalizedRect;
  shape: MarkerShape;
}

export interface VesselDiagramConfig {
  imageFile: File;
  imageName: string;
  calibration: HullCalibration;
  hullMarkers: ZoneMarker[];
  nicheMarkers: ZoneMarker[];
  confirmed: boolean;
}
```

Use this initial valid calibration when a new image is accepted:

```ts
export const DEFAULT_CALIBRATION: HullCalibration = {
  sternX: 0.08,
  bowX: 0.92,
  hullTopY: 0.15,
  bottomY: 0.86,
};
```

- [ ] **Step 4: Implement projection, validation, clamping, and five Hull defaults**

Define template-relative Hull rectangles in stern-to-bow order, each occupying one fifth of the calibrated length and the full calibrated height. `projectTemplateRect` must use these equations:

```ts
const length = calibration.bowX - calibration.sternX;
const height = calibration.bottomY - calibration.hullTopY;
return clampRect({
  x: calibration.sternX + rect.x * length,
  y: calibration.hullTopY + rect.y * height,
  width: rect.width * length,
  height: rect.height * height,
});
```

- [ ] **Step 5: Write failing Bilge Keel centering tests**

```ts
it.each([1, 3, 5])('centers odd Bilge Keel quantity %i on its middle marker', (quantity) => {
  const markers = createBilgeKeelMarkers(DEFAULT_CALIBRATION, quantity);
  const middle = markers[Math.floor(quantity / 2)].rect;
  expect(middle.x + middle.width / 2).toBeCloseTo(0.5, 8);
});

it.each([2, 4, 6])('centers even Bilge Keel quantity %i on its middle boundary', (quantity) => {
  const markers = createBilgeKeelMarkers(DEFAULT_CALIBRATION, quantity);
  const left = markers[quantity / 2 - 1].rect;
  const right = markers[quantity / 2].rect;
  expect((left.x + left.width + right.x) / 2).toBeCloseTo(0.5, 8);
});

it('numbers Bilge Keel from stern to bow', () => {
  expect(createBilgeKeelMarkers(DEFAULT_CALIBRATION, 3).map(({ id, unit }) => [id, unit]))
    .toEqual([
      ['bilge-keel-1', 1],
      ['bilge-keel-2', 2],
      ['bilge-keel-3', 3],
    ]);
});
```

- [ ] **Step 6: Implement Niche templates and quantity-driven Bilge Keel layout**

Use Hull-relative template rectangles so four guide changes create a usable layout:

```ts
const NICHE_TEMPLATES = {
  'propeller-group': { x: 0.04, y: 0.63, width: 0.08, height: 0.16 },
  'aft-services': { x: 0.12, y: 0.42, width: 0.07, height: 0.14 },
  'rudder-group': { x: 0.11, y: 0.58, width: 0.07, height: 0.14 },
  'fwd-services': { x: 0.81, y: 0.44, width: 0.07, height: 0.14 },
  'bulbous-bow': { x: 0.89, y: 0.63, width: 0.08, height: 0.16 },
  'transducer-aft': { x: 0.18, y: 0.50, width: 0.055, height: 0.12 },
  'transducer-fwd': { x: 0.76, y: 0.50, width: 0.055, height: 0.12 },
  'anode-aft': { x: 0.25, y: 0.61, width: 0.055, height: 0.12 },
  'anode-fwd': { x: 0.69, y: 0.61, width: 0.055, height: 0.12 },
} as const;
```

Bilge total span is `0.60 × calibrated length`; use a gap equal to `0.008 × calibrated length`, capped so every marker keeps positive width. Treat non-finite or values below one as quantity one. Every niche marker uses `ELLIPSE`; Hull markers use `RECTANGLE`.

- [ ] **Step 7: Run geometry tests and commit**

Run: `pnpm vitest run src/vesselDiagram/geometry.test.ts`

Expected: PASS.

```bash
git add src/vesselDiagram/types.ts src/vesselDiagram/geometry.ts src/vesselDiagram/geometry.test.ts
git commit -m "feat: add vessel diagram geometry"
```

---

### Task 2: Resolve Scope components to deterministic marker IDs

**Files:**
- Create: `src/vesselDiagram/markers.ts`
- Create: `src/vesselDiagram/markers.test.ts`
- Modify: `src/vesselDiagram/types.ts`

**Interfaces:**
- Produces `MarkerGroupId` and `RequiredMarkerGroup`.
- Produces `bilgeQuantityFromSections(sections: ReportSection[]): number`.
- Produces `requiredMarkerGroups(sections: ReportSection[]): RequiredMarkerGroup[]`.
- Produces `resolveMarkerIds(section: ReportSection): string[]`.
- Produces `markersForSection(config, section): ZoneMarker[]`.

- [ ] **Step 1: Write failing mapping tests for every canonical component**

```ts
it.each([
  ['FWD', ['hull-fwd']],
  ['FWD-MID', ['hull-fwd-mid']],
  ['MID', ['hull-mid']],
  ['MID-AFT', ['hull-mid-aft']],
  ['AFT', ['hull-aft']],
  ['PROPELLER BLADE', ['propeller-group']],
  ['FIN BLADE', ['propeller-group']],
  ['STERN FRAME', ['propeller-group']],
  ['ROPE GUARD', ['propeller-group']],
  ['BOSS CAP', ['propeller-group']],
  ['SEA CHEST', ['aft-services']],
  ['DISCHARGE PIPE', ['aft-services']],
  ['RUDDER & PINTLE', ['rudder-group']],
  ['BOW THRUSTER', ['fwd-services']],
  ['BULBOUS BOW', ['bulbous-bow']],
  ['TRANSDUCER', ['transducer-aft', 'transducer-fwd']],
  ['ANODE / ICCP', ['anode-aft', 'anode-fwd']],
])('%s resolves independently from report labels', (component, expected) => {
  expect(resolveMarkerIds(section(component))).toEqual(expected);
});

it('resolves Bilge Keel by unit and shares PORT/STBD geometry', () => {
  expect(resolveMarkerIds(section('BILGE KEEL', 'PORT', 2))).toEqual(['bilge-keel-2']);
  expect(resolveMarkerIds(section('BILGE KEEL', 'STBD', 2))).toEqual(['bilge-keel-2']);
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-module failure**

Run: `pnpm vitest run src/vesselDiagram/markers.test.ts`

Expected: FAIL because `markers.ts` does not exist.

- [ ] **Step 3: Implement canonical lookup without using display labels**

Normalize only `ReportSection.component` with `trim().toUpperCase()`. Do not inspect `ReportLabelMap`, the custom upper-area label, title, caption, service, or phase. Resolve `RUDDER` as a compatibility alias for `RUDDER & PINTLE`; do not expose Stern Thruster or Emergency Sea Chest.

```ts
export function resolveMarkerIds(section: ReportSection): string[] {
  if (section.area === 'GENERAL') return GENERAL_MARKERS[canonical(section.component)] ?? [];
  if (canonical(section.component) === 'BILGE KEEL') {
    return [`bilge-keel-${Math.max(1, section.unit ?? 1)}`];
  }
  return NICHE_MARKERS[canonical(section.component)] ?? [];
}
```

- [ ] **Step 4: Implement required-group derivation and Bilge quantity**

`requiredMarkerGroups` preserves the first occurrence order in `ReportSection[]`, merges shared-location components, and marks Transducer/Anode as one group with two marker IDs. `bilgeQuantityFromSections` returns the maximum Bilge `unit`, or one when a Bilge section exists without units, or zero when Bilge is outside Scope.

- [ ] **Step 5: Run marker and report-label tests and commit**

Run: `pnpm vitest run src/vesselDiagram/markers.test.ts src/app/reportLabels.test.ts src/docx/reportModel.test.ts`

Expected: PASS and existing label customization remains independent.

```bash
git add src/vesselDiagram/types.ts src/vesselDiagram/markers.ts src/vesselDiagram/markers.test.ts
git commit -m "feat: map report sections to vessel markers"
```

---

### Task 3: Compose one shared page-specific vessel PNG

**Files:**
- Create: `src/vesselDiagram/composer.ts`
- Create: `src/vesselDiagram/composer.test.ts`

**Interfaces:**
- Produces `ComposeDependencies` for deterministic Canvas/Image test doubles.
- Produces `fitContain(sourceWidth, sourceHeight, targetWidth, targetHeight): PixelRect`.
- Produces `composeVesselDiagram(config, markerIds, deps?): Promise<Uint8Array>`.
- Consumes `markersForSection` indirectly through callers; accepts marker IDs so tests can assert page isolation.

- [ ] **Step 1: Write failing contain-fit and draw-order tests**

```ts
it('contain-fits a wide image without stretching', () => {
  expect(fitContain(1000, 250, 2048, 488)).toEqual({ x: 48, y: 0, width: 1952, height: 488 });
});

it('draws white, image, then only requested markers on 2048 by 488', async () => {
  const calls: string[] = [];
  const bytes = await composeVesselDiagram(configWithAllMarkers(), ['transducer-aft', 'transducer-fwd'], fakeComposer(calls));
  expect(calls[0]).toBe('canvas:2048x488');
  expect(calls).toContain('fill:#ffffff');
  expect(calls.filter((call) => call.startsWith('ellipse:'))).toHaveLength(2);
  expect(calls.join('|')).not.toContain('propeller-group');
  expect(bytes).toEqual(new Uint8Array([137, 80, 78, 71]));
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-module failure**

Run: `pnpm vitest run src/vesselDiagram/composer.test.ts`

Expected: FAIL because `composer.ts` does not exist.

- [ ] **Step 3: Implement image decoding and Canvas creation behind dependencies**

The default browser path must:

1. decode with `createImageBitmap(config.imageFile)` when available;
2. otherwise create an object URL, wait for an `HTMLImageElement`, then revoke the URL in `finally`;
3. create an `HTMLCanvasElement` of `2048 × 488`;
4. reject with `VESSEL_IMAGE_DECODE_FAILED`, `VESSEL_CANVAS_UNAVAILABLE`, or `VESSEL_PNG_ENCODE_FAILED` rather than returning the old template image.

- [ ] **Step 4: Implement deterministic raster drawing**

Fill white, draw the contain-fitted image, and then draw markers in the passed ID order. Convert normalized coordinates by multiplying x/width by 2048 and y/height by 488. Use the template-like overlay:

```ts
context.fillStyle = 'rgba(230, 64, 64, 0.32)';
context.strokeStyle = '#d83b3b';
context.lineWidth = 4;
```

Use `fillRect`/`strokeRect` for rectangles and `ellipse` with center and radii for ellipses. Encode with `canvas.toBlob(..., 'image/png')` and return `new Uint8Array(await blob.arrayBuffer())`.

- [ ] **Step 5: Run compositor tests and commit**

Run: `pnpm vitest run src/vesselDiagram/composer.test.ts`

Expected: PASS.

```bash
git add src/vesselDiagram/composer.ts src/vesselDiagram/composer.test.ts
git commit -m "feat: compose vessel diagram png"
```

---

### Task 4: Build the Hull-first and Niche-second web editor

**Files:**
- Create: `src/app/VesselDiagramEditor.tsx`
- Create: `src/app/VesselDiagramEditor.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `VesselDiagramEditor` consumes `{ sections, value, onChange, onBack, onNext }`.
- `value` is `VesselDiagramConfig | null`; `onChange` receives the full current draft.
- The editor produces confirmed config only after image, valid Hull calibration, and all required Scope marker IDs exist.
- The component's object URL is presentation-only and is revoked on file replacement/unmount; it is never stored in config.

- [ ] **Step 1: Write failing upload and two-step workflow tests**

```tsx
render(<Harness sections={[generalSection('FWD'), nicheSection('TRANSDUCER')]} />);
vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 320, close: vi.fn() })));
await user.upload(screen.getByLabelText('선박 사이드뷰 이미지'),
  new File(['png'], 'vessel.png', { type: 'image/png' }));

expect(screen.getByRole('heading', { name: 'Hull 맞추기' })).toBeVisible();
expect(screen.getByRole('button', { name: 'Niche 맞추기로 이동' })).toBeEnabled();
expect(screen.queryByRole('heading', { name: 'Niche 맞추기' })).not.toBeInTheDocument();

await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
expect(screen.getByRole('heading', { name: 'Niche 맞추기' })).toBeVisible();
expect(screen.getAllByLabelText('Transducer 표식')).toHaveLength(2);
```

- [ ] **Step 2: Run the component test and verify the missing-module failure**

Run: `pnpm vitest run src/app/VesselDiagramEditor.test.tsx`

Expected: FAIL because `VesselDiagramEditor.tsx` does not exist.

- [ ] **Step 3: Implement accepted-file validation and draft creation**

Accept only `image/png`, `image/jpeg`, `.png`, `.jpg`, and `.jpeg`. Decode the candidate with `createImageBitmap` or an object-URL `HTMLImageElement` before replacing the current draft; close the bitmap or revoke the temporary URL after reading dimensions. Reject zero-size or undecodable files, leave the previous draft unchanged, and show `PNG 또는 JPG 선박 이미지를 확인할 수 없습니다.`. On success, construct the draft from `DEFAULT_CALIBRATION`, `createDefaultHullMarkers`, and `createDefaultNicheMarkers(bilgeQuantityFromSections(sections))`.

- [ ] **Step 4: Render the fixed-aspect calibration surface and guides**

Use a `position: relative` canvas with `aspect-ratio: 2048 / 488`, the object-URL image using `object-fit: contain`, and an absolutely positioned SVG `viewBox="0 0 2048 488"`. Render stern/bow as vertical guide lines and hull-top/bottom as horizontal guide lines. Give each guide an accessible name: `선미 기준선`, `선수 기준선`, `Hull 상단선`, `Bottom 기준선`.

- [ ] **Step 5: Write failing pointer, resize, and keyboard tests**

```tsx
const marker = screen.getByLabelText('AFT Hull 표식');
fireEvent.pointerDown(marker, { clientX: 100, clientY: 100, pointerId: 1 });
fireEvent.pointerMove(marker, { clientX: 120, clientY: 110, pointerId: 1 });
fireEvent.pointerUp(marker, { pointerId: 1 });
expect(latest().hullMarkers.find(({ id }) => id === 'hull-aft')?.rect.x).toBeGreaterThan(initialX);

marker.focus();
fireEvent.keyDown(marker, { key: 'ArrowRight' });
expect(latestX()).toBeCloseTo(afterDragX + 1 / 2048, 8);
fireEvent.keyDown(marker, { key: 'ArrowDown', shiftKey: true });
expect(latestY()).toBeCloseTo(afterDragY + 10 / 488, 8);
```

- [ ] **Step 6: Implement one pointer interaction state for move, resize, and guides**

Track `{ kind: 'GUIDE' | 'MOVE' | 'RESIZE'; id; startPoint; startRect?; edge? }` in a ref. Convert client deltas through `getBoundingClientRect()` to normalized deltas; call `setPointerCapture`; clamp every result. Marker corner handles use `nw`, `ne`, `sw`, and `se`. Minimum marker size is `8 / 2048` wide and `8 / 488` high. Arrow keys move by one canonical pixel, or ten with Shift.

- [ ] **Step 7: Implement group list, selection, resets, and confirmation safeguards**

Show Scope-relevant groups first and remaining approved groups collapsed below. Transducer and Anode group rows select both linked markers but allow each marker to retain independent coordinates. Provide `선택 표식 초기화`, `그룹 초기화`, and `자동 배치 다시 적용`. If confirmed Hull guides change while any Niche rectangle differs from its recalculated default, call `window.confirm('Hull 변경 시 Niche 위치가 자동 배치로 재계산됩니다. 계속할까요?')` before replacing Niche markers.

Confirmation button text is `선박 위치도 설정 완료`. It is disabled until:

```ts
isValidCalibration(value.calibration)
&& requiredMarkerGroups(sections).every((group) =>
  group.markerIds.every((id) => allMarkers.some((marker) => marker.id === id)))
```

Clicking it emits the same config with `confirmed: true` and calls `onNext`.

- [ ] **Step 8: Add responsive styling within the existing design system**

At desktop width, use a 2-column editor: diagram and controls. Keep `.workspace` and its established `max-width`; do not create a full-viewport canvas. Below 900px, stack controls under the diagram in two compact rows, keep labels horizontal, and make all pointer targets at least 40px. Use the existing navy/teal/gray/red variables and button classes.

- [ ] **Step 9: Run editor tests and commit**

Run: `pnpm vitest run src/app/VesselDiagramEditor.test.tsx src/vesselDiagram/geometry.test.ts src/vesselDiagram/markers.test.ts`

Expected: PASS.

```bash
git add src/app/VesselDiagramEditor.tsx src/app/VesselDiagramEditor.test.tsx src/styles.css
git commit -m "feat: add vessel diagram editor"
```

---

### Task 5: Insert the editor into the application workflow and reset lifecycle

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- App owns `vesselDiagram: VesselDiagramConfig | null`.
- Workflow stages become indexes `0..5`: Vessel/Scope, Vessel Diagram, Photo Folder, Report Input, Check/Preview, Word.
- `runExport` passes `vesselDiagram` to `WordExportInput` only when confirmed.
- Scope reset clears `vesselDiagram`; a Scope rebuild preserves the image/calibration and invalidates confirmation only when required markers change.

- [ ] **Step 1: Write a failing stage-order test**

```tsx
await buildCleaningGeneral(user);
expect(screen.getByRole('button', { name: '선박 위치도 설정' })).toBeVisible();
expect(screen.queryByRole('heading', { name: '사진 폴더' })).not.toBeInTheDocument();

await user.click(screen.getByRole('button', { name: '선박 위치도 설정' }));
expect(screen.getByRole('heading', { name: '선박 위치도 설정' })).toBeVisible();
expect(screen.getByRole('button', { name: 'Niche 맞추기로 이동' })).toBeDisabled();
```

- [ ] **Step 2: Run App tests and verify the stage failure**

Run: `pnpm vitest run src/App.test.tsx`

Expected: FAIL because photo input is still embedded below Vessel/Scope and the editor stage is absent.

- [ ] **Step 3: Replace the stage-index translation with six direct stages**

```ts
const stages = ['Vessel / Scope', 'Vessel Diagram', '사진 폴더', 'Report Input', 'Check / Preview', 'Word'];
```

Pass `active={stage}` to `StageRail`. Render only `VesselScope` at stage 0, `VesselDiagramEditor` at stage 1, `PhotoSource` at stage 2, `ReportInput` at stage 3, `CheckPreview` at stage 4, and `ExportScreen` at stage 5. Remove the embedded `PhotoSource` from stage 0.

- [ ] **Step 4: Update transitions and guards**

- Scope success exposes `선박 위치도 설정` instead of `사진 폴더로 이동`.
- Stage 1 back returns to stage 0; successful confirmation advances to stage 2.
- Photo stage back returns to stage 1; Report Input opens stage 3.
- QA issue focus opens stage 3.
- Report Input advances to 4; Preview advances to 5; export back returns to 4.
- StageRail cannot enter stage 2 or later without confirmed `vesselDiagram`.
- Word export without a confirmed diagram sets `선박 위치도 설정을 완료한 뒤 Word 보고서를 생성하세요.` and does not call the exporter.
- If a Scope rebuild changes Bilge Keel quantity and existing Bilge rectangles differ from their current automatic defaults, ask `빌지킬 수량을 변경하면 조정한 위치가 다시 배치됩니다. 계속할까요?`. Cancel aborts the Scope rebuild; confirm replaces only `bilge-keel-*` markers with `createBilgeKeelMarkers`, preserves all other markers/image/calibration, and sets `confirmed: false`.

- [ ] **Step 5: Update shared test helpers once, then preserve existing report tests**

Add `completeVesselDiagram(user)` to `src/App.test.tsx`:

```ts
async function completeVesselDiagram(user: ReturnType<typeof userEvent.setup>) {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 320, close: vi.fn() })));
  await user.click(screen.getByRole('button', { name: '선박 위치도 설정' }));
  await user.upload(screen.getByLabelText('선박 사이드뷰 이미지'),
    new File(['vessel'], 'vessel.png', { type: 'image/png' }));
  await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
  await user.click(screen.getByRole('button', { name: '선박 위치도 설정 완료' }));
}
```

Call it in helpers/tests that advance beyond Scope. Replace the old embedded-photo wrapper assertion with an assertion that stage 0 and stage 1 are separate. Do not weaken condition, photo, label, preview, or export assertions.

- [ ] **Step 6: Verify reset and exporter input**

```tsx
await completeVesselDiagram(user);
await user.click(screen.getByRole('button', { name: 'Vessel / Scope' }));
await user.click(screen.getByRole('button', { name: 'Scope 초기화' }));
expect(screen.queryByText('vessel.png')).not.toBeInTheDocument();

await user.click(screen.getByRole('button', { name: 'Word 보고서 다운로드' }));
expect(exporter).toHaveBeenCalledWith(expect.objectContaining({
  vesselDiagram: expect.objectContaining({ imageName: 'vessel.png', confirmed: true }),
}));
```

- [ ] **Step 7: Run App tests and commit**

Run: `pnpm vitest run src/App.test.tsx`

Expected: PASS with the new stage order and all existing report-input behavior preserved.

```bash
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add vessel diagram workflow stage"
```

---

### Task 6: Use the shared composition in Preview

**Files:**
- Create: `src/app/VesselDiagramPreview.tsx`
- Create: `src/app/VesselDiagramPreview.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `VesselDiagramPreview` consumes `{ config, section, compose? }`.
- It calls `resolveMarkerIds(section)` and `composeVesselDiagram(config, markerIds)`.
- It revokes the previous composed PNG object URL whenever section/config changes and on unmount.
- `CheckPreview` and `WordTemplatePreviewPage` receive the confirmed config.

- [ ] **Step 1: Write a failing shared-compositor Preview test**

```tsx
const compose = vi.fn(async () => new Uint8Array([137, 80, 78, 71]));
const { rerender, unmount } = render(
  <VesselDiagramPreview config={config} section={transducerSection} compose={compose} />,
);
expect(compose).toHaveBeenCalledWith(config, ['transducer-aft', 'transducer-fwd']);

rerender(<VesselDiagramPreview config={config} section={propellerSection} compose={compose} />);
expect(compose).toHaveBeenLastCalledWith(config, ['propeller-group']);
unmount();
expect(URL.revokeObjectURL).toHaveBeenCalled();
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `pnpm vitest run src/app/VesselDiagramPreview.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the preview lifecycle**

Compose into a Blob with MIME `image/png`, create an object URL, render an `<img alt="선박 위치도 미리보기">`, and show the existing diagram frame while loading. On composition failure, show `선박 위치도를 만들지 못했습니다.` and do not show the old SVG.

- [ ] **Step 4: Replace the existing schematic ship SVG only on first Word pages**

Replace `TemplateShipDiagram` with `VesselDiagramPreview` inside the existing `page.kind === 'first'` block. Continuation pages stay unchanged because the Word template has no location diagram on those pages. Pass the same `page.section` that the writer receives.

- [ ] **Step 5: Add page-isolation assertions**

In `src/App.test.tsx`, navigate Preview through Propeller, Transducer, Anode / ICCP, and two Bilge units. Assert the requested marker ID list is respectively one shared Propeller ID, two Transducer IDs, two Anode IDs, and the matching single Bilge unit ID. Assert custom Word labels do not change the ID list.

- [ ] **Step 6: Run Preview/App tests and commit**

Run: `pnpm vitest run src/app/VesselDiagramPreview.test.tsx src/App.test.tsx src/vesselDiagram/composer.test.ts src/vesselDiagram/markers.test.ts`

Expected: PASS.

```bash
git add src/app/VesselDiagramPreview.tsx src/app/VesselDiagramPreview.test.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: preview page-specific vessel markers"
```

---

### Task 7: Replace the template vessel image and remove floating zone shapes

**Files:**
- Modify: `src/docx/templateWriter.ts`
- Modify: `src/docx/templateWriter.test.ts`
- Modify: `src/docx/templateWriter.integration.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- `WordExportInput` gains required `vesselDiagram: VesselDiagramConfig`.
- `WriterDependencies` gains optional `composeDiagram(config, markerIds): Promise<Uint8Array>` for tests.
- Produces internal `replaceVesselProfile(document, relationshipId): void`.
- Produces internal `removeLegacyZoneShapes(document): void`.
- First pages consume `resolveMarkerIds(page.section)` and a unique composed PNG relationship; continuation pages do not compose a diagram.

- [ ] **Step 1: Extend the minimal template fixture with vessel and zone drawings**

In `src/docx/templateWriter.test.ts`, add one inline drawing with:

```xml
<wp:docPr id="10" name="vessel_profile" descr="vessel_profile" title="Vessel profile base image"/>
<a:blip r:embed="rId11"/>
<wp:extent cx="5301000" cy="1260000"/>
```

and two floating anchors whose `wp:docPr descr` values begin with `zone_`. Add `rId11` pointing to `media/image1.png` in the fixture relationships.

- [ ] **Step 2: Write failing Word replacement tests**

```ts
const composeDiagram = vi.fn(async (_config, ids) =>
  new TextEncoder().encode(ids.join(',')));
const result = await writeTemplateReport({ ...input, vesselDiagram: config }, {
  fetchTemplate: fixtureTemplate,
  resize: async () => new Uint8Array([1, 2, 3]),
  composeDiagram,
});
const zip = await JSZip.loadAsync(result.blob);
const xml = await zip.file('word/document.xml')!.async('text');

expect(composeDiagram).toHaveBeenCalledWith(config, ['transducer-aft', 'transducer-fwd']);
expect(xml).not.toContain('descr="zone_');
expect(xml).toContain('cx="5301000" cy="1260000"');
expect(xml).toContain('r:embed="rIdVesselDiagram1"');
expect(await zip.file('word/media/vessel-diagram-1.png')!.async('text'))
  .toBe('transducer-aft,transducer-fwd');
```

- [ ] **Step 3: Run writer tests and verify the missing replacement behavior**

Run: `pnpm vitest run src/docx/templateWriter.test.ts`

Expected: FAIL because `WordExportInput`, the page compositor, and drawing replacement are absent.

- [ ] **Step 4: Implement strict profile replacement while preserving extent**

Find `wp:docPr` where `descr === 'vessel_profile'` or `name === 'vessel_profile'`, walk to its enclosing `w:drawing`, find the descendant `a:blip`, and replace only its `r:embed`. Do not recreate the drawing, its paragraph, `wp:inline`, `wp:extent`, borders, table row, or cell. Throw `VESSEL_PROFILE_DRAWING_NOT_FOUND` when the template profile cannot be found.

- [ ] **Step 5: Remove all legacy zone anchors from each first-page fragment**

For every `wp:docPr` whose decoded `descr` contains a line beginning `zone_`, remove the nearest enclosing `w:r` that owns the corresponding `wp:anchor`. Do not remove the `vessel_profile` inline drawing. Assert no `wp:docPr` with `descr="zone_..."` remains after serialization.

- [ ] **Step 6: Add one unique PNG per first page**

Before photo slots, for each `page.kind === 'first'`:

1. resolve marker IDs from `page.section`;
2. reject an empty ID list as `VESSEL_MARKER_NOT_FOUND:<section.id>`;
3. compose with the injected/default composer;
4. save `word/media/vessel-diagram-{index}.png`;
5. add `rIdVesselDiagram{index}` with the image relationship type;
6. repoint the profile drawing;
7. remove legacy zone shapes.

Keep the photo `imageIndex` counter independent. Ensure `[Content_Types].xml` has `<Default Extension="png" ContentType="image/png"/>`. If composition fails, throw `VESSEL_DIAGRAM_COMPOSITION_FAILED:<section.id>` so export stops rather than using the wrong drawing.

- [ ] **Step 7: Expand bundled-template integration coverage**

Use the real `public/templates/Detail_report_template.docx` and a config containing all default markers. Generate consecutive Propeller, Transducer, Anode / ICCP, and Bilge unit pages, then assert:

- each first page has a different `rIdVesselDiagramN` relationship;
- the original inline `wp:extent` values are unchanged from the source template;
- no `zone_fwd`, `zone_bilge_keel`, or other `zone_*` description remains;
- all PNG media entries exist;
- Section 1–4 is still prepended;
- original header/footer XML, font names, table widths, caption rows, and photo-slot counts remain equal to their current fixture expectations.

- [ ] **Step 8: Run Word and App export tests and commit**

Run: `pnpm vitest run src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts src/App.test.tsx`

Expected: PASS.

```bash
git add src/docx/templateWriter.ts src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts src/App.tsx
git commit -m "feat: export calibrated vessel diagrams to word"
```

---

### Task 8: Verify the complete browser-to-Word flow and publish

**Files:**
- Modify: `e2e/demo.spec.ts`
- Create: `e2e/fixtures/vessel-side.png`
- Modify: `README.md`

**Interfaces:**
- Playwright helper `completeVesselDiagram(page, filePath)` mirrors the real Hull-first/Niche-second workflow.
- The existing downloaded-DOCX structural test additionally verifies vessel PNG relationships and removed floating markers.

- [ ] **Step 1: Add an E2E helper and representative flow assertions**

```ts
async function completeVesselDiagram(page: Page) {
  await page.getByRole('button', { name: '선박 위치도 설정' }).click();
  await page.getByLabel('선박 사이드뷰 이미지').setInputFiles('e2e/fixtures/vessel-side.png');
  await page.getByRole('button', { name: 'Niche 맞추기로 이동' }).click();
  await page.getByRole('button', { name: '선박 위치도 설정 완료' }).click();
  await expect(page.getByRole('heading', { name: '사진 폴더' })).toBeVisible();
}
```

Add a small `e2e/fixtures/vessel-side.png` copied from the template's current base image so the test is deterministic and redistribution-safe. Update all E2E flows that leave Scope to call the helper.

- [ ] **Step 2: Verify responsive controls and editor behavior at 1440px**

At a 1440px viewport, assert the editor stays within `.workspace`, move the AFT marker with pointer input, resize it with a visible handle, move it by keyboard, and confirm Niche. At a narrow viewport, assert the controls form two horizontal rows rather than vertical letter wrapping.

- [ ] **Step 3: Verify Preview/Word parity in one end-to-end case**

Create a Scope containing Propeller, Transducer, Anode / ICCP, and Bilge Keel quantity three. Confirm the Preview shows two markers for Transducer and Anode, one shared Propeller marker, and one marker for the active Bilge unit. Download Word and inspect with JSZip:

```ts
expect(documentXml).not.toContain('descr="zone_');
expect(documentXml).toContain('rIdVesselDiagram');
expect(zip.file(/word\/media\/vessel-diagram-\d+\.png/).length).toBeGreaterThan(0);
```

- [ ] **Step 4: Update the README workflow**

Document the six stages, local-only vessel image handling, Hull-before-Niche requirement, linked Transducer/Anode markers, Bilge quantity behavior, and the fact that Word contains flattened page-specific PNGs.

- [ ] **Step 5: Run focused and full verification**

Run in order:

```bash
pnpm vitest run src/vesselDiagram src/app/VesselDiagramEditor.test.tsx src/app/VesselDiagramPreview.test.tsx src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts src/App.test.tsx
pnpm test:run
pnpm lint
pnpm build
pnpm build:portable
pnpm test:e2e
```

Expected: every command exits 0; the downloaded DOCX contains Section 1–4 plus detailed pages, unique page-specific vessel PNGs, no floating `zone_*` shapes, and unchanged template layout assertions.

- [ ] **Step 6: Commit verified E2E/docs changes**

```bash
git add e2e README.md
git commit -m "test: verify vessel diagram report flow"
```

- [ ] **Step 7: Publish only after the verified commits are clean**

Check that `git status --short` shows only intentionally untracked visual-design scratch files, then push `main` and verify the deployed GitHub Pages URL loads the new Vessel Diagram stage. Do not publish if any test, build, or DOCX structural assertion fails.
