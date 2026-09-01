# Vessel Diagram Callout and Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make vessel diagram markers readable with editor-only callouts and let users Ctrl-select, move, align, and distribute arbitrary markers.

**Architecture:** Keep persisted ZoneMarker geometry unchanged. Add pure modules for callout layout and marker transforms, then make VesselDiagramEditor render a full-width staged canvas whose temporary callouts and selection state never enter VesselDiagramConfig or the Word composer.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 4, Testing Library, Playwright, CSS

**Spec:** docs/superpowers/specs/2026-09-02-vessel-diagram-callout-alignment-design.md

## Global Constraints

- Callout labels and leader lines are editing aids only and must not appear in preview PNGs or Word output.
- Do not add callout fields to ZoneMarker or VesselDiagramConfig.
- Keep the established 1440px application content width and prevent horizontal page overflow.
- Plain click selects one marker; Ctrl+click toggles individual markers; Escape clears selection.
- Two selected markers enable alignment; three selected markers enable distribution.
- Multi-marker movement preserves marker sizes and relative positions and keeps every marker inside the normalized canvas.
- Existing saved diagrams and composer output remain compatible.
- Preserve the existing design tokens, typography scale, button styles, and visual language.

## File Structure

- Create src/vesselDiagram/callouts.ts for deterministic editor-only callout geometry.
- Create src/vesselDiagram/callouts.test.ts for callout ordering, spacing, bounds, and identity tests.
- Create src/vesselDiagram/alignment.ts for pure alignment, distribution, and bounded translation helpers.
- Create src/vesselDiagram/alignment.test.ts for transform tests.
- Modify src/app/VesselDiagramEditor.tsx for selection, callout rendering, toolbar, and group movement.
- Modify src/app/VesselDiagramEditor.test.tsx for interaction and accessibility tests.
- Modify src/styles.css for the staged canvas, callout bands, toolbar, controls, and responsive layout.
- Modify e2e/demo.spec.ts for desktop and narrow-width verification.

---

### Task 1: Deterministic callout layout engine

**Files:**
- Create: src/vesselDiagram/callouts.ts
- Create: src/vesselDiagram/callouts.test.ts

**Interfaces:**
- Consumes: NormalizedRect from src/vesselDiagram/types.ts.
- Produces: layoutMarkerCallouts(markers): MarkerCallout[].
- Produces: CALLOUT_BAND_HEIGHT, CALLOUT_STAGE_HEIGHT, and CALLOUT_LABEL_WIDTH.

- [ ] **Step 1: Write the failing callout tests**

Create src/vesselDiagram/callouts.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import { CALLOUT_BAND_HEIGHT, CALLOUT_LABEL_WIDTH, layoutMarkerCallouts } from './callouts';

const marker = (id: string, x: number, y = .5) => ({
  id,
  label: id,
  rect: { x, y, width: .04, height: .08 },
});

describe('vessel diagram callouts', () => {
  it('orders markers and alternates lanes', () => {
    const result = layoutMarkerCallouts([
      marker('c', .5), marker('a', .1), marker('b', .3), marker('d', .7),
    ]);
    expect(result.map(({ id, lane }) => [id, lane])).toEqual([
      ['a', 'TOP'], ['b', 'BOTTOM'], ['c', 'TOP'], ['d', 'BOTTOM'],
    ]);
  });

  it('keeps dense labels separated and in bounds', () => {
    const result = layoutMarkerCallouts(Array.from(
      { length: 12 },
      (_, index) => marker(String(index + 1), .44 + index * .01),
    ));
    for (const lane of ['TOP', 'BOTTOM'] as const) {
      const labels = result.filter((item) => item.lane === lane)
        .sort((a, b) => a.labelCenter.x - b.labelCenter.x);
      labels.forEach((item) => {
        expect(item.labelCenter.x - CALLOUT_LABEL_WIDTH / 2).toBeGreaterThanOrEqual(0);
        expect(item.labelCenter.x + CALLOUT_LABEL_WIDTH / 2).toBeLessThanOrEqual(2048);
      });
      for (let index = 1; index < labels.length; index += 1) {
        expect(labels[index].labelCenter.x - labels[index - 1].labelCenter.x)
          .toBeGreaterThanOrEqual(CALLOUT_LABEL_WIDTH + 12);
      }
    }
  });

  it('connects each line to its own marker center', () => {
    const [result] = layoutMarkerCallouts([marker('target', .25, .4)]);
    expect(result.anchor.x).toBeCloseTo(.27 * 2048, 8);
    expect(result.anchor.y).toBeCloseTo(CALLOUT_BAND_HEIGHT + .44 * 488, 8);
    expect(result.points[0]).toEqual(result.anchor);
    expect(result.points.at(-1)).toEqual(result.labelCenter);
  });

  it('drops malformed markers safely', () => {
    expect(layoutMarkerCallouts([
      { id: 'bad', label: 'Bad', rect: { x: Number.NaN, y: 0, width: .1, height: .1 } },
    ])).toEqual([]);
  });
});
~~~

- [ ] **Step 2: Run the new test and verify it fails**

Run: npm test -- --run src/vesselDiagram/callouts.test.ts

Expected: FAIL because ./callouts does not exist.

- [ ] **Step 3: Implement the callout layout**

Create src/vesselDiagram/callouts.ts with these exact public declarations:

~~~ts
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, type NormalizedRect } from './types';

export const CALLOUT_BAND_HEIGHT = 100;
export const CALLOUT_STAGE_HEIGHT = DIAGRAM_HEIGHT + CALLOUT_BAND_HEIGHT * 2;
export const CALLOUT_LABEL_WIDTH = 180;
const LABEL_GAP = 12;

export interface CalloutMarker { id: string; label: string; rect: NormalizedRect }
export interface CalloutPoint { x: number; y: number }
export interface MarkerCallout {
  id: string;
  label: string;
  lane: 'TOP' | 'BOTTOM';
  anchor: CalloutPoint;
  elbow: CalloutPoint;
  labelCenter: CalloutPoint;
  points: CalloutPoint[];
}

export function layoutMarkerCallouts(markers: CalloutMarker[]): MarkerCallout[] {
  const ordered = markers
    .filter(({ label, rect }) => label.trim()
      && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite))
    .sort((a, b) => {
      const delta = a.rect.x + a.rect.width / 2 - (b.rect.x + b.rect.width / 2);
      return delta || a.id.localeCompare(b.id);
    });
  const laneMarkers = {
    TOP: ordered.filter((_, index) => index % 2 === 0),
    BOTTOM: ordered.filter((_, index) => index % 2 === 1),
  } as const;
  const centerById = new Map<string, number>();
  for (const lane of Object.values(laneMarkers)) {
    const centers = lane.map(({ rect }) => Math.min(
      DIAGRAM_WIDTH - CALLOUT_LABEL_WIDTH / 2,
      Math.max(
        CALLOUT_LABEL_WIDTH / 2,
        (rect.x + rect.width / 2) * DIAGRAM_WIDTH,
      ),
    ));
    for (let index = 1; index < centers.length; index += 1) {
      centers[index] = Math.max(
        centers[index],
        centers[index - 1] + CALLOUT_LABEL_WIDTH + LABEL_GAP,
      );
    }
    const overflow = Math.max(
      0,
      (centers.at(-1) ?? 0) + CALLOUT_LABEL_WIDTH / 2 - DIAGRAM_WIDTH,
    );
    for (let index = 0; index < centers.length; index += 1) centers[index] -= overflow;
    for (let index = centers.length - 2; index >= 0; index -= 1) {
      centers[index] = Math.min(
        centers[index],
        centers[index + 1] - CALLOUT_LABEL_WIDTH - LABEL_GAP,
      );
    }
    const deficit = Math.max(0, CALLOUT_LABEL_WIDTH / 2 - (centers[0] ?? 0));
    lane.forEach(({ id }, index) => centerById.set(id, centers[index] + deficit));
  }

  return ordered.map((marker, index) => {
    const lane = index % 2 === 0 ? 'TOP' : 'BOTTOM';
    const anchor = {
      x: (marker.rect.x + marker.rect.width / 2) * DIAGRAM_WIDTH,
      y: CALLOUT_BAND_HEIGHT
        + (marker.rect.y + marker.rect.height / 2) * DIAGRAM_HEIGHT,
    };
    const elbowY = lane === 'TOP'
      ? CALLOUT_BAND_HEIGHT - 12
      : CALLOUT_BAND_HEIGHT + DIAGRAM_HEIGHT + 12;
    const labelCenter = {
      x: centerById.get(marker.id) ?? anchor.x,
      y: lane === 'TOP' ? 38 : CALLOUT_STAGE_HEIGHT - 38,
    };
    const elbow = { x: anchor.x, y: elbowY };
    return {
      id: marker.id,
      label: marker.label,
      lane,
      anchor,
      elbow,
      labelCenter,
      points: [anchor, elbow, { x: labelCenter.x, y: elbowY }, labelCenter],
    };
  });
}
~~~

- [ ] **Step 4: Run the callout tests**

Run: npm test -- --run src/vesselDiagram/callouts.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add src/vesselDiagram/callouts.ts src/vesselDiagram/callouts.test.ts
git commit -m "feat: add vessel marker callout layout"
~~~

---

### Task 2: Marker alignment and bounded multi-marker transforms

**Files:**
- Create: src/vesselDiagram/alignment.ts
- Create: src/vesselDiagram/alignment.test.ts

**Interfaces:**
- Consumes: ZoneMarker[] and selected marker IDs.
- Produces: alignMarkerSelection(markers, selectedIds, mode): ZoneMarker[].
- Produces: distributeMarkerSelection(markers, selectedIds, axis): ZoneMarker[].
- Produces: translateMarkerSelection(markers, selectedIds, delta): ZoneMarker[].

- [ ] **Step 1: Write failing transform tests**

Create src/vesselDiagram/alignment.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import { alignMarkerSelection, distributeMarkerSelection, translateMarkerSelection } from './alignment';
import type { ZoneMarker } from './types';

const markers: ZoneMarker[] = [
  { id: 'a', groupId: 'a', shape: 'ELLIPSE', rect: { x: .1, y: .2, width: .1, height: .1 } },
  { id: 'b', groupId: 'b', shape: 'ELLIPSE', rect: { x: .4, y: .5, width: .2, height: .15 } },
  { id: 'c', groupId: 'c', shape: 'ELLIPSE', rect: { x: .8, y: .7, width: .1, height: .1 } },
];

describe('marker alignment', () => {
  it.each([
    ['LEFT', (rect: ZoneMarker['rect']) => rect.x],
    ['CENTER_X', (rect: ZoneMarker['rect']) => rect.x + rect.width / 2],
    ['RIGHT', (rect: ZoneMarker['rect']) => rect.x + rect.width],
    ['TOP', (rect: ZoneMarker['rect']) => rect.y],
    ['MIDDLE_Y', (rect: ZoneMarker['rect']) => rect.y + rect.height / 2],
    ['BOTTOM', (rect: ZoneMarker['rect']) => rect.y + rect.height],
  ] as const)('aligns in %s without resizing', (mode, coordinate) => {
    const result = alignMarkerSelection(markers, ['a', 'b'], mode);
    expect(coordinate(result[0].rect)).toBeCloseTo(coordinate(result[1].rect), 10);
    expect(result.map(({ rect }) => [rect.width, rect.height]))
      .toEqual(markers.map(({ rect }) => [rect.width, rect.height]));
    expect(result[2]).toBe(markers[2]);
  });

  it.each(['HORIZONTAL', 'VERTICAL'] as const)('distributes on %s', (axis) => {
    const result = distributeMarkerSelection(markers, ['a', 'b', 'c'], axis);
    const centers = result.map(({ rect }) => axis === 'HORIZONTAL'
      ? rect.x + rect.width / 2 : rect.y + rect.height / 2);
    expect(centers[1] - centers[0]).toBeCloseTo(centers[2] - centers[1], 10);
  });

  it('bounds mixed-group translation as one rigid selection', () => {
    const result = translateMarkerSelection(markers, ['a', 'b'], { x: -1, y: 1 });
    expect(result[0].rect.x).toBe(0);
    expect(result[1].rect.x - result[0].rect.x).toBeCloseTo(.3, 10);
    expect(result[1].rect.y - result[0].rect.y).toBeCloseTo(.3, 10);
    expect(result[1].rect.y + result[1].rect.height).toBeLessThanOrEqual(1);
  });
});
~~~

- [ ] **Step 2: Run the tests and verify they fail**

Run: npm test -- --run src/vesselDiagram/alignment.test.ts

Expected: FAIL because ./alignment does not exist.

- [ ] **Step 3: Implement the transform module**

Create src/vesselDiagram/alignment.ts with:

~~~ts
export type MarkerAlignment =
  | 'LEFT' | 'CENTER_X' | 'RIGHT'
  | 'TOP' | 'MIDDLE_Y' | 'BOTTOM';
export type MarkerDistribution = 'HORIZONTAL' | 'VERTICAL';
~~~

Use the selected bounding box for alignment targets. Preserve width and height. For distribution, sort by center, preserve the first and last centers, and use (last-first)/(count-1) for intermediate centers. translateMarkerSelection clamps one shared delta against the selected bounding box, then applies that same delta to all selected markers. Return the input array when selection counts are below two for alignment or below three for distribution.

- [ ] **Step 4: Run transform and geometry tests**

Run: npm test -- --run src/vesselDiagram/alignment.test.ts src/vesselDiagram/geometry.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add src/vesselDiagram/alignment.ts src/vesselDiagram/alignment.test.ts
git commit -m "feat: add vessel marker alignment tools"
~~~

---

### Task 3: Ctrl-selection, Escape clearing, and generalized group movement

**Files:**
- Modify: src/app/VesselDiagramEditor.tsx
- Modify: src/app/VesselDiagramEditor.test.tsx

**Interfaces:**
- Consumes: translateMarkerSelection from src/vesselDiagram/alignment.ts.
- Produces: temporary selectedIds behavior used by the toolbar and callout layer.

- [ ] **Step 1: Add failing editor interaction tests**

Append these cases to VesselDiagramEditor.test.tsx:

~~~tsx
it('Ctrl-selects arbitrary markers, plain-clicks one, and clears with Escape', async () => {
  const user = userEvent.setup();
  recordDraft(existingDraft(), [
    nicheSection('TRANSDUCER'),
    nicheSection('ANODE / ICCP'),
    nicheSection('BILGE KEEL', 2),
  ]);
  await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
  const aft = screen.getByRole('button', { name: 'Transducer AFT 표식' });
  const fwd = screen.getByRole('button', { name: 'Transducer FWD 표식' });

  await user.keyboard('{Control>}');
  await user.click(aft);
  await user.click(fwd);
  await user.keyboard('{/Control}');
  expect(aft).toHaveAttribute('aria-pressed', 'true');
  expect(fwd).toHaveAttribute('aria-pressed', 'true');

  await user.click(aft);
  expect(aft).toHaveAttribute('aria-pressed', 'true');
  expect(fwd).toHaveAttribute('aria-pressed', 'false');
  await user.keyboard('{Escape}');
  expect(aft).toHaveAttribute('aria-pressed', 'false');
});

it('moves a mixed multi-selection as one bounded group', async () => {
  const user = userEvent.setup();
  const latest = recordDraft(existingDraft(), [
    nicheSection('TRANSDUCER'), nicheSection('ANODE / ICCP'),
  ]);
  await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
  const aft = screen.getByRole('button', { name: 'Transducer AFT 표식' });
  const anode = screen.getByRole('button', { name: 'Anode AFT 표식' });
  fireEvent.pointerDown(aft, { clientX: 100, clientY: 100, pointerId: 1, ctrlKey: true });
  fireEvent.pointerUp(aft, { pointerId: 1, ctrlKey: true });
  fireEvent.pointerDown(anode, { clientX: 100, clientY: 100, pointerId: 2, ctrlKey: true });
  fireEvent.pointerUp(anode, { pointerId: 2, ctrlKey: true });
  const before = latest().nicheMarkers.filter(({ id }) =>
    ['transducer-aft', 'anode-aft'].includes(id));

  fireEvent.pointerDown(aft, { clientX: 100, clientY: 100, pointerId: 3 });
  fireEvent.pointerMove(aft, { clientX: 130, clientY: 120, pointerId: 3 });
  fireEvent.pointerUp(aft, { pointerId: 3 });
  const after = latest().nicheMarkers.filter(({ id }) =>
    ['transducer-aft', 'anode-aft'].includes(id));
  expect(after[0].rect.x - before[0].rect.x)
    .toBeCloseTo(after[1].rect.x - before[1].rect.x, 8);
  expect(after[0].rect.y - before[0].rect.y)
    .toBeCloseTo(after[1].rect.y - before[1].rect.y, 8);
});
~~~

- [ ] **Step 2: Run the editor test and verify selection failures**

Run: npm test -- --run src/app/VesselDiagramEditor.test.tsx

Expected: FAIL because names are not unique and Ctrl-selection is absent.

- [ ] **Step 3: Add unambiguous marker names**

Update markerName with exact direction and unit labels:

~~~ts
const markerName = (marker: ZoneMarker) => {
  if (marker.id.startsWith('hull-')) {
    return marker.id.slice(5).toUpperCase().replaceAll('-', ' ') + ' Hull';
  }
  if (marker.id.startsWith('transducer-')) {
    return 'Transducer ' + (marker.id.endsWith('-aft') ? 'AFT' : 'FWD');
  }
  if (marker.id.startsWith('anode-')) {
    return 'Anode ' + (marker.id.endsWith('-aft') ? 'AFT' : 'FWD');
  }
  if (marker.id.startsWith('bilge-keel-')) {
    return 'Bilge Keel ' + String(marker.unit ?? 1).padStart(2, '0');
  }
  return DISPLAY_NAMES[markerGroup(marker)] ?? marker.id;
};
~~~

- [ ] **Step 4: Implement click-versus-drag selection transitions**

Extend Interaction with moved and collapseOnClick. Ctrl/Meta pointer-down toggles a marker. Toggling off ends without drag. Plain pointer-down on an unselected marker selects it alone. Plain pointer-down on a member of a multi-selection retains the set for dragging; pointer-up without movement collapses to that one marker. Mark moved after a non-zero pointer delta.

Add the Escape listener:

~~~ts
useEffect(() => {
  const clearSelection = (event: globalThis.KeyboardEvent) => {
    if (event.key === 'Escape') setSelectedIds([]);
  };
  window.addEventListener('keydown', clearSelection);
  return () => window.removeEventListener('keydown', clearSelection);
}, []);
~~~

Clear selectedIds when moving between Hull and Niche.

- [ ] **Step 5: Generalize group movement**

Replace the Bilge-only move condition with selected markers from the current step. Use translateMarkerSelection for pointer and keyboard movement. Keep the existing selected Bilge Keel resize behavior; a mixed-group resize changes only the operated marker.

- [ ] **Step 6: Run interaction regressions**

Run: npm test -- --run src/app/VesselDiagramEditor.test.tsx src/vesselDiagram/alignment.test.ts src/vesselDiagram/geometry.test.ts

Expected: PASS, including existing Bilge move and resize coverage.

- [ ] **Step 7: Commit**

~~~bash
git add src/app/VesselDiagramEditor.tsx src/app/VesselDiagramEditor.test.tsx
git commit -m "feat: add multi-select vessel markers"
~~~

---

### Task 4: Full-width callout canvas and alignment toolbar

**Files:**
- Modify: src/app/VesselDiagramEditor.tsx
- Modify: src/app/VesselDiagramEditor.test.tsx
- Modify: src/styles.css

**Interfaces:**
- Consumes: layoutMarkerCallouts, CALLOUT_STAGE_HEIGHT, alignMarkerSelection, and distributeMarkerSelection.
- Produces: editor-only SVG leaders, HTML labels, and accessible alignment controls.

- [ ] **Step 1: Add failing render and toolbar tests**

Append:

~~~tsx
it('renders editor-only callouts with unique labels and lines', async () => {
  const user = userEvent.setup();
  recordDraft(existingDraft(), [nicheSection('TRANSDUCER'), nicheSection('BILGE KEEL', 2)]);
  await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
  expect(screen.getByText('Transducer AFT', { selector: '.diagram-callout-label' })).toBeVisible();
  expect(screen.getByText('Transducer FWD', { selector: '.diagram-callout-label' })).toBeVisible();
  expect(screen.getByText('Bilge Keel 01', { selector: '.diagram-callout-label' })).toBeVisible();
  expect(document.querySelectorAll('.diagram-callout-line'))
    .toHaveLength(existingDraft().nicheMarkers.length);
});

it('enables alignment for two and distribution for three selections', async () => {
  const user = userEvent.setup();
  const latest = recordDraft(existingDraft(), [
    nicheSection('TRANSDUCER'), nicheSection('ANODE / ICCP'),
  ]);
  await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
  const names = ['Transducer AFT 표식', 'Transducer FWD 표식', 'Anode AFT 표식'];
  for (const name of names.slice(0, 2)) {
    const target = screen.getByRole('button', { name });
    fireEvent.pointerDown(target, { pointerId: 1, ctrlKey: true });
    fireEvent.pointerUp(target, { pointerId: 1, ctrlKey: true });
  }
  expect(screen.getByRole('toolbar', { name: '표식 정렬' })).toBeVisible();
  expect(screen.getByRole('button', { name: '가로 균등 배치' })).toBeDisabled();
  const third = screen.getByRole('button', { name: names[2] });
  fireEvent.pointerDown(third, { pointerId: 2, ctrlKey: true });
  fireEvent.pointerUp(third, { pointerId: 2, ctrlKey: true });
  expect(screen.getByRole('button', { name: '가로 균등 배치' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '상단 정렬' }));
  const selected = latest().nicheMarkers.filter(({ id }) =>
    ['transducer-aft', 'transducer-fwd', 'anode-aft'].includes(id));
  expect(selected.every(({ rect }) => rect.y === selected[0].rect.y)).toBe(true);
});
~~~

- [ ] **Step 2: Run tests and verify missing callout/toolbar failures**

Run: npm test -- --run src/app/VesselDiagramEditor.test.tsx

Expected: FAIL because callout elements and toolbar do not exist.

- [ ] **Step 3: Render the staged canvas**

Compute visibleMarkers from the current step and pass markerName labels to layoutMarkerCallouts. Wrap vessel-diagram-surface in diagram-callout-stage. Add diagram-callout-lines with viewBox 0 0 2048 688, one polyline per callout, and one absolutely positioned diagram-callout-label per callout. Join point coordinates with String(point.x) + ',' + String(point.y). Remove marker-label from the marker button while retaining its aria-label and resize handles.

- [ ] **Step 4: Add alignment actions and toolbar**

Add applyAlignment(mode) and applyDistribution(axis) that transform only the current step collection and preserve selectedIds. Render role=toolbar with:

- 왼쪽 정렬, 가로 중앙 정렬, 오른쪽 정렬
- 상단 정렬, 세로 가운데 정렬, 하단 정렬
- 가로 균등 배치, 세로 균등 배치

The toolbar appears with two selections; both distribution buttons use disabled={selectedIds.length < 3}.

- [ ] **Step 5: Apply full-width styling**

Use these structural rules and retain existing variables:

~~~css
.vessel-diagram-editor { max-width: 1440px; }
.diagram-editor-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.diagram-panel { min-width: 0; padding: 14px; }
.diagram-callout-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 2048 / 688;
  overflow: hidden;
  border: 1px solid #c9d8dc;
  border-radius: 9px;
  background: #fff;
}
.diagram-callout-lines {
  position: absolute;
  z-index: 3;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.diagram-callout-line {
  fill: none;
  stroke: #54747b;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.diagram-callout-line.selected { stroke: var(--danger); stroke-width: 3; }
.diagram-callout-label {
  position: absolute;
  z-index: 4;
  width: calc(100% * 180 / 2048);
  min-height: 30px;
  transform: translate(-50%, -50%);
  border: 1px solid #9fb8bd;
  border-radius: 6px;
  background: rgba(255,255,255,.96);
  font-size: var(--font-ui-xs);
  font-weight: 850;
  text-align: center;
  pointer-events: none;
}
.diagram-callout-label.selected { border-color: var(--danger); background: #fff3f1; }
.diagram-controls { grid-template-columns: minmax(240px, .7fr) minmax(0, 1.6fr); }
.diagram-alignment-toolbar { display: flex; flex-wrap: wrap; gap: 7px; }
~~~

Position vessel-diagram-surface inside the stage at 100/688 of the stage height with a height of 488/688. At max-width 900px, wrap controls and toolbar without horizontal overflow.

- [ ] **Step 6: Run editor and export-isolation tests**

Run: npm test -- --run src/app/VesselDiagramEditor.test.tsx src/app/VesselDiagramPreview.test.tsx src/vesselDiagram/composer.test.ts

Expected: PASS. Composer tests remain unchanged.

- [ ] **Step 7: Commit**

~~~bash
git add src/app/VesselDiagramEditor.tsx src/app/VesselDiagramEditor.test.tsx src/styles.css
git commit -m "feat: add vessel diagram callouts and alignment UI"
~~~

---

### Task 5: Browser regression and complete verification

**Files:**
- Modify: e2e/demo.spec.ts

**Interfaces:**
- Consumes: final accessible editor DOM.
- Produces: browser evidence for layout, callout spacing, Ctrl selection, alignment, and workflow completion.

- [ ] **Step 1: Extend the existing vessel diagram browser test**

After moving to Niche, add:

~~~ts
await page.getByRole('button', { name: 'Niche 맞추기로 이동' }).click();
const callouts = page.locator('.diagram-callout-label');
await expect(callouts.first()).toBeVisible();
const laneBoxes = await callouts.evaluateAll((nodes) => nodes.map((node) => {
  const box = node.getBoundingClientRect();
  return { left: box.left, right: box.right, top: box.top };
}));
for (let first = 0; first < laneBoxes.length; first += 1) {
  for (let second = first + 1; second < laneBoxes.length; second += 1) {
    if (Math.abs(laneBoxes[first].top - laneBoxes[second].top) < 2) {
      expect(
        laneBoxes[first].right <= laneBoxes[second].left
        || laneBoxes[second].right <= laneBoxes[first].left,
      ).toBe(true);
    }
  }
}

const aft = page.getByRole('button', { name: 'Transducer AFT 표식' });
const fwd = page.getByRole('button', { name: 'Transducer FWD 표식' });
await aft.click({ modifiers: ['Control'] });
await fwd.click({ modifiers: ['Control'] });
await expect(page.getByRole('toolbar', { name: '표식 정렬' })).toBeVisible();
await page.getByRole('button', { name: '상단 정렬' }).click();
const [aftBox, fwdBox] = await Promise.all([aft.boundingBox(), fwd.boundingBox()]);
expect(aftBox!.y).toBeCloseTo(fwdBox!.y, 0);

const [editorRight, viewportWidth] = await Promise.all([
  editor.evaluate((node) => node.getBoundingClientRect().right),
  page.evaluate(() => window.innerWidth),
]);
expect(editorRight).toBeLessThanOrEqual(viewportWidth);
~~~

Repeat the overflow assertion after switching to the existing 800px viewport. Complete the workflow with 선박 위치도 설정 완료 after these assertions.

- [ ] **Step 2: Run the targeted browser test**

Run: npx playwright test e2e/demo.spec.ts -g "vessel diagram receives real guide"

Expected: PASS at both viewport sizes.

- [ ] **Step 3: Run the complete unit suite**

Run: npm run test:run

Expected: all unit/component tests PASS.

- [ ] **Step 4: Run lint and production build**

Run: npm run lint

Expected: exit code 0.

Run: npm run build

Expected: exit code 0.

- [ ] **Step 5: Run the complete browser suite**

Run: npm run test:e2e

Expected: all applicable tests PASS; intentionally skipped tests remain skipped.

- [ ] **Step 6: Confirm export isolation and clean diff**

Run: git diff --check

Expected: no whitespace errors.

Run: git diff -- src/vesselDiagram/composer.ts src/app/VesselDiagramPreview.tsx src/vesselDiagram/types.ts

Expected: no changes.

- [ ] **Step 7: Commit browser coverage**

~~~bash
git add e2e/demo.spec.ts
git commit -m "test: cover vessel diagram callouts and alignment"
~~~
