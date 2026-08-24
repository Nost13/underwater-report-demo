# Report Input UX and Group Condition Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 1440px PC workflow easier to read and operate by adding explicit photo-folder progress, one-click Section navigation, phase-colored photo assignment, reusable group Condition defaults with child overrides, and consistent 12px controls.

**Architecture:** Keep `ReportSection.conditions` as the effective report value so QA, preview, captions, and Word export do not need inheritance logic. Add normalized group-default/source maps to `ReportState`, expose them through reducer actions, and build the new controls around one shared Condition editor. Keep the current single-page application structure, adding only focused helper modules for Condition inheritance and concise Section labels.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 4, Testing Library, Playwright 1.62 with Microsoft Edge, CSS, File System Access API, Vite/vinext.

**Spec:** `docs/superpowers/specs/2026-08-24-report-input-ux-condition-defaults-design.md`

## Global Constraints

- Target Windows Chrome/Edge at a 1440px reference width; preserve the existing 1120px minimum desktop shell.
- Keep Vessel lookup verification-only and keep photos, Conditions, and generated reports local to the browser.
- Keep source photos as `File` references; do not add Base64 source storage or server persistence.
- Inspection uses `CURRENT`; Cleaning, Polishing, Repair, and Removal use `BEFORE` and `AFTER`.
- AFTER initializes as Clean / R0 with Observed Normal / Trace.
- Keep pagination, Report Use, QA, preview, caption, and Word template behavior unchanged.
- Apply the 12px typography scale only to application chrome and controls; do not alter `.report-page`, `.preview-photo`, Word template dimensions, or Word typography.
- Keep deletion source-safe: `DELETE_PHOTO` removes only the report reference and never touches the source file.
- Add no new runtime dependency.

## File Structure

### Create

- `src/app/conditionDefaults.ts` — normalized group keys, immutable Condition cloning/patching, inheritance map initialization, and group member lookup.
- `src/app/conditionDefaults.test.ts` — pure helper coverage for key isolation, Side/Unit grouping, and clone safety.
- `src/app/ConditionEditor.tsx` — shared Fouling and Observed controls used by both group defaults and child phases.
- `src/app/reportLabels.ts` — concise visible Section labels with full identifiers retained for accessibility.
- `src/app/reportLabels.test.ts` — GENERAL/NICHE/Side/Unit label coverage.

### Modify

- `src/app/reportState.ts` — add Condition default/source maps and reducer actions for apply, override, and revert.
- `src/app/reportState.test.ts` — verify Service/Area/Component boundaries, propagation, override preservation, revert, and Scope reset.
- `src/App.tsx` — add folder-structure completion state, group editor, one-click navigator, dedicated phase selector, and consistent photo actions.
- `src/App.test.tsx` — cover all new UI interactions and replace dropdown-specific assertions.
- `src/styles.css` — add typography tokens, progress/navigator/group/phase styles, and accessible photo action sizing while excluding document preview typography.
- `e2e/demo.spec.ts` — update Section selection, add 1440px inheritance/progress/active-target/typography/overflow checks, and preserve full workflow export verification.

The features share `ReportState`, `ReportInput`, and the same 1440px workspace, so they remain one implementation plan. The tasks below are still independently testable and independently reviewable.

For every local Playwright command in this plan, run `pnpm dev` in a separate terminal first and wait until `http://localhost:3000` responds. Keep that server running for the selected E2E command, then stop it before build or public-deployment verification.

---

### Task 1: Condition inheritance state and reducer actions

**Files:**
- Create: `src/app/conditionDefaults.ts`
- Create: `src/app/conditionDefaults.test.ts`
- Modify: `src/app/reportState.ts:1-65`
- Modify: `src/app/reportState.test.ts:1-75`

**Interfaces:**
- Consumes: `Condition`, `Phase`, `ReportSection`, and `ServiceKind` from `src/domain/types.ts`; `defaultConditions()` from `src/domain/structure.ts`.
- Produces: `ConditionPatch`, `ConditionSource`, `ConditionDefaults`, `ConditionSources`, `conditionGroupKey()`, `cloneCondition()`, `patchCondition()`, `initializeConditionInheritance()`, and `conditionGroupMembers()`.
- Produces reducer actions `APPLY_GROUP_CONDITION` and `REVERT_CONDITION_TO_GROUP`; `UPDATE_CONDITION` additionally marks a child phase as `OVERRIDE`.

- [ ] **Step 1: Write failing pure helper tests**

Create `src/app/conditionDefaults.test.ts` with concrete grouping and isolation cases:

```ts
import { describe, expect, it } from 'vitest';
import { createNicheSections } from '../domain/structure';
import {
  cloneCondition,
  conditionGroupKey,
  conditionGroupMembers,
  initializeConditionInheritance,
} from './conditionDefaults';

describe('condition defaults', () => {
  const polishing = createNicheSections({
    component: 'Propeller Blade',
    type: 'QUANTITY',
    quantity: 2,
    service: 'POLISHING',
  });
  const inspection = createNicheSections({
    component: 'Propeller Blade',
    type: 'QUANTITY',
    quantity: 1,
    service: 'INSPECTION',
  });

  it('groups Side and Unit children by Service, Area, and Component only', () => {
    expect(conditionGroupKey(polishing[0])).toBe(conditionGroupKey(polishing[1]));
    expect(conditionGroupKey(polishing[0])).not.toBe(conditionGroupKey(inspection[0]));
    expect(conditionGroupMembers([...polishing, ...inspection], polishing[0]))
      .toEqual(polishing);
  });

  it('initializes every present phase as GROUP with independent Condition objects', () => {
    const inheritance = initializeConditionInheritance([...polishing, ...inspection]);
    expect(inheritance.conditionSources[polishing[0].id]).toEqual({
      BEFORE: 'GROUP',
      AFTER: 'GROUP',
    });
    expect(inheritance.conditionSources[inspection[0].id]).toEqual({ CURRENT: 'GROUP' });

    const first = inheritance.conditionDefaults[conditionGroupKey(polishing[0])].BEFORE!;
    const cloned = cloneCondition(first);
    cloned.observed.type = 'Scratch';
    expect(first.observed.type).toBe('');
  });
});
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run: `pnpm test:run -- src/app/conditionDefaults.test.ts`

Expected: FAIL because `src/app/conditionDefaults.ts` and its exports do not exist.

- [ ] **Step 3: Implement the Condition inheritance helpers**

Create `src/app/conditionDefaults.ts` with these exact public types and signatures:

```ts
import { defaultConditions } from '../domain/structure';
import type { Condition, Phase, ReportSection } from '../domain/types';

export type ConditionPatch = {
  fouling?: Partial<Condition['fouling']>;
  observed?: Partial<Condition['observed']>;
};
export type ConditionSource = 'GROUP' | 'OVERRIDE';
export type ConditionDefaults = Record<string, Partial<Record<Phase, Condition>>>;
export type ConditionSources = Record<
  string,
  Partial<Record<Phase, ConditionSource>>
>;

export const conditionGroupKey = (
  section: Pick<ReportSection, 'service' | 'area' | 'component'>,
): string => JSON.stringify([
  section.service,
  section.area,
  section.component.trim().toUpperCase(),
]);

export const cloneCondition = (condition: Condition): Condition => ({
  fouling: { ...condition.fouling },
  observed: { ...condition.observed },
});

export const patchCondition = (base: Condition, patch: ConditionPatch): Condition => ({
  fouling: { ...base.fouling, ...patch.fouling },
  observed: { ...base.observed, ...patch.observed },
});

export function conditionGroupMembers(
  sections: ReportSection[],
  anchor: ReportSection,
): ReportSection[] {
  const key = conditionGroupKey(anchor);
  return sections.filter((section) => conditionGroupKey(section) === key);
}

export function initializeConditionInheritance(sections: ReportSection[]): {
  conditionDefaults: ConditionDefaults;
  conditionSources: ConditionSources;
} {
  const conditionDefaults: ConditionDefaults = {};
  const conditionSources: ConditionSources = {};
  for (const section of sections) {
    const groupKey = conditionGroupKey(section);
    conditionDefaults[groupKey] ??= {};
    conditionSources[section.id] ??= {};
    const serviceDefaults = defaultConditions(section.service);
    for (const phase of section.phases) {
      const effective = section.conditions[phase] ?? serviceDefaults[phase];
      if (effective && !conditionDefaults[groupKey][phase]) {
        conditionDefaults[groupKey][phase] = cloneCondition(effective);
      }
      conditionSources[section.id][phase] = 'GROUP';
    }
  }
  return { conditionDefaults, conditionSources };
}
```

- [ ] **Step 4: Run the helper tests and verify GREEN**

Run: `pnpm test:run -- src/app/conditionDefaults.test.ts`

Expected: PASS for both helper tests.

- [ ] **Step 5: Write failing reducer tests for apply, override, reapply, revert, and Scope reset**

Append to `src/app/reportState.test.ts`:

```ts
it('applies a phase default to matching children while preserving overrides', () => {
  const blades = createNicheSections({
    component: 'Propeller Blade', type: 'QUANTITY', quantity: 2, service: 'POLISHING',
  });
  let state = reportReducer(initialReportState, { type: 'SET_SCOPE', sections: blades });

  state = reportReducer(state, {
    type: 'APPLY_GROUP_CONDITION',
    sectionId: blades[0].id,
    phase: 'BEFORE',
    condition: {
      fouling: { type: 'Medium Macro Fouling', coverage: 20, slimeOnly: false },
      observed: { type: '', level: 'Normal / Trace' },
    },
  });
  expect(state.sections.map((item) => item.conditions.BEFORE?.fouling.coverage))
    .toEqual([20, 20]);

  state = reportReducer(state, {
    type: 'UPDATE_CONDITION',
    sectionId: blades[1].id,
    phase: 'BEFORE',
    patch: { fouling: { coverage: 40 } },
  });
  expect(state.conditionSources[blades[1].id].BEFORE).toBe('OVERRIDE');

  state = reportReducer(state, {
    type: 'APPLY_GROUP_CONDITION',
    sectionId: blades[0].id,
    phase: 'BEFORE',
    condition: {
      fouling: { type: 'Light Macro fouling', coverage: 5, slimeOnly: false },
      observed: { type: '', level: 'Normal / Trace' },
    },
  });
  expect(state.sections.map((item) => item.conditions.BEFORE?.fouling.coverage))
    .toEqual([5, 40]);

  state = reportReducer(state, {
    type: 'REVERT_CONDITION_TO_GROUP',
    sectionId: blades[1].id,
    phase: 'BEFORE',
  });
  expect(state.sections[1].conditions.BEFORE?.fouling.coverage).toBe(5);
  expect(state.conditionSources[blades[1].id].BEFORE).toBe('GROUP');
});

it('rebuilds condition inheritance when Scope is replaced', () => {
  const first = createNicheSections({
    component: 'Boss Cap', type: 'SINGLE', quantity: 1, service: 'CLEANING',
  });
  const second = createNicheSections({
    component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'INSPECTION',
  });
  const seeded = reportReducer(initialReportState, { type: 'SET_SCOPE', sections: first });
  const reset = reportReducer(seeded, { type: 'SET_SCOPE', sections: second });
  expect(Object.keys(reset.conditionDefaults)).toHaveLength(1);
  expect(reset.conditionSources).toEqual({
    [second[0].id]: { CURRENT: 'GROUP' },
  });
});
```

- [ ] **Step 6: Run reducer tests and verify RED**

Run: `pnpm test:run -- src/app/reportState.test.ts`

Expected: FAIL because the new state maps and reducer actions are absent.

- [ ] **Step 7: Implement reducer state and actions**

Modify `src/app/reportState.ts` so `ReportState` includes:

```ts
conditionDefaults: ConditionDefaults;
conditionSources: ConditionSources;
```

Initialize both as `{}`. Make `SET_SCOPE` call `initializeConditionInheritance(action.sections)` and return the new maps with cleared photos. Add action variants:

```ts
| { type: 'APPLY_GROUP_CONDITION'; sectionId: string; phase: Phase; condition: Condition }
| { type: 'REVERT_CONDITION_TO_GROUP'; sectionId: string; phase: Phase }
```

Implement `UPDATE_CONDITION` with `patchCondition()` and set
`conditionSources[action.sectionId][action.phase]` to `OVERRIDE`. Implement group apply by deriving the anchor's `conditionGroupKey`, cloning the supplied Condition into the default map, and copying it only to matching members that contain the phase and are not `OVERRIDE`. Implement revert by copying the latest stored group default back to the target Section and setting the source to `GROUP`. Return unchanged state if the Section, phase, or group default does not exist.

- [ ] **Step 8: Run reducer and complete unit tests**

Run: `pnpm test:run -- src/app/conditionDefaults.test.ts src/app/reportState.test.ts`

Expected: PASS with existing pagination, photo assignment, and phase independence tests unchanged.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/app/conditionDefaults.ts src/app/conditionDefaults.test.ts src/app/reportState.ts src/app/reportState.test.ts
git commit -m "feat: add group condition inheritance"
```

---

### Task 2: Shared Condition editor and group-default controls

**Files:**
- Create: `src/app/ConditionEditor.tsx`
- Modify: `src/App.tsx:1-17,615-664`
- Modify: `src/App.test.tsx:255-281`
- Modify: `src/styles.css:255-289`

**Interfaces:**
- Consumes: `ConditionPatch`, `cloneCondition()`, `conditionGroupKey()`, and `conditionGroupMembers()` from Task 1.
- Produces: `ConditionEditor({ ariaPrefix, condition, onPatch })` and the visible `구역 기본 Condition` editor.
- Produces child status copy `기본값 사용` or `개별 수정` and action `기본값으로 되돌리기`.

- [ ] **Step 1: Write the failing group-default UI test**

Add this interaction test to `src/App.test.tsx`:

```ts
it('applies a group Condition, preserves a child override, and can revert it', async () => {
  const user = userEvent.setup();
  render(<App />);
  await buildCleaningGeneral(user);
  await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

  const groupCoverage = screen.getByLabelText('구역 기본 BEFORE fouling coverage');
  await user.clear(groupCoverage);
  await user.type(groupCoverage, '15');
  await user.click(screen.getByRole('button', { name: 'BEFORE 기본값 적용' }));
  expect(screen.getByLabelText('BEFORE fouling coverage')).toHaveValue(15);
  expect(screen.getByText('기본값 사용')).toBeVisible();

  await user.click(screen.getByRole('button', { name: '다음 Section' }));
  const childCoverage = screen.getByLabelText('BEFORE fouling coverage');
  expect(childCoverage).toHaveValue(15);
  await user.clear(childCoverage);
  await user.type(childCoverage, '40');
  expect(screen.getByText('개별 수정')).toBeVisible();

  await user.click(screen.getByRole('button', { name: '이전 Section' }));
  await user.clear(screen.getByLabelText('구역 기본 BEFORE fouling coverage'));
  await user.type(screen.getByLabelText('구역 기본 BEFORE fouling coverage'), '20');
  await user.click(screen.getByRole('button', { name: 'BEFORE 기본값 적용' }));
  await user.click(screen.getByRole('button', { name: '다음 Section' }));
  expect(screen.getByLabelText('BEFORE fouling coverage')).toHaveValue(40);

  await user.click(screen.getByRole('button', { name: 'BEFORE 기본값으로 되돌리기' }));
  expect(screen.getByLabelText('BEFORE fouling coverage')).toHaveValue(20);
  expect(screen.getByText('기본값 사용')).toBeVisible();
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `pnpm test:run -- src/App.test.tsx -t "applies a group Condition"`

Expected: FAIL because the group editor and inheritance status controls are not rendered.

- [ ] **Step 3: Extract the shared Condition editor**

Create `src/app/ConditionEditor.tsx` with the shared derivation and markup below. This replaces the copy currently embedded in `PhasePanel`:

```tsx
import type { ReactNode } from 'react';
import {
  deriveFoulingCondition,
  deriveFoulingRating,
  deriveFoulingType,
  deriveObservedRating,
} from '../domain/conditions';
import type { Condition, ObservedLevel, ObservedType } from '../domain/types';
import type { ConditionPatch } from './conditionDefaults';

interface ConditionEditorProps {
  ariaPrefix: string;
  condition: Condition;
  onPatch: (patch: ConditionPatch) => void;
}

const observedLevels: Exclude<ObservedLevel, ''>[] = [
  'Normal / Trace',
  'Minor Observation',
  'Notable Observation',
  'Significant Observation',
  'Critical Observation',
];
const observedTypes: Exclude<ObservedType, ''>[] = [
  'Coating', 'Damage', 'Scratch', 'Corrosion', 'Other',
];

function ConditionGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="condition-group">
    <header>{title}</header>
    <div className="condition-columns">{children}</div>
  </section>;
}

export function ConditionEditor({ ariaPrefix, condition, onPatch }: ConditionEditorProps) {
  const foulingRating = deriveFoulingRating(
    condition.fouling.coverage,
    condition.fouling.slimeOnly,
  );
  const foulingType = deriveFoulingType(
    condition.fouling.coverage,
    condition.fouling.slimeOnly,
  );
  const observedRating = deriveObservedRating(condition.observed.level);
  const changeCoverage = (coverage: number | null) => {
    const slimeOnly = coverage === 0 ? false : condition.fouling.slimeOnly;
    const derived = deriveFoulingCondition(coverage, slimeOnly);
    onPatch({ fouling: { coverage, slimeOnly, type: derived.type } });
  };
  const changeSlimeOnly = (slimeOnly: boolean) => {
    const derived = deriveFoulingCondition(condition.fouling.coverage, slimeOnly);
    onPatch({ fouling: { slimeOnly, type: derived.type } });
  };

  return <div className="condition-tables">
    <ConditionGroup title="FOULING CONDITION">
      <label><span>RATING</span><output
        aria-label={`${ariaPrefix} fouling rating`}
        className={`rating-badge rating-${foulingRating || 'empty'}`}
      >{foulingRating ? `R${foulingRating}` : '—'}</output></label>
      <label><span>TYPE</span><output
        aria-label={`${ariaPrefix} fouling type`}
        className="condition-value"
      >{foulingType || '선택'}</output></label>
      <div className="condition-field"><span>SURFACE COVERAGE</span>
        <div className="coverage-input"><input
          aria-label={`${ariaPrefix} fouling coverage`}
          type="number" min="0" max="100" step="1"
          value={condition.fouling.coverage ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            changeCoverage(value === ''
              ? null
              : Math.min(100, Math.max(0, Math.round(Number(value)))));
          }}
        /><span>%</span></div>
        <label className="slime-toggle"><input
          aria-label={`${ariaPrefix} Slime Only`}
          type="checkbox"
          checked={condition.fouling.slimeOnly}
          disabled={condition.fouling.coverage === null || condition.fouling.coverage === 0}
          onChange={(event) => changeSlimeOnly(event.target.checked)}
        /><span>Slime Only</span></label>
      </div>
    </ConditionGroup>
    <ConditionGroup title="OBSERVED CONDITION">
      <label><span>RATING</span><output
        aria-label={`${ariaPrefix} observed rating`}
        className={`rating-badge rating-${observedRating || 'empty'}`}
      >{observedRating ? `R${observedRating}` : '—'}</output></label>
      <label><span>LEVEL</span><select
        aria-label={`${ariaPrefix} observed level`}
        value={condition.observed.level}
        onChange={(event) => onPatch({
          observed: { level: event.target.value as ObservedLevel },
        })}
      ><option value="">없음</option>{observedLevels.map((value) => (
        <option key={value}>{value}</option>
      ))}</select></label>
      <label><span>TYPE</span><select
        aria-label={`${ariaPrefix} observed type`}
        value={condition.observed.type}
        onChange={(event) => onPatch({
          observed: { type: event.target.value as ObservedType },
        })}
      ><option value="">선택</option>{observedTypes.map((value) => (
        <option key={value}>{value}</option>
      ))}</select></label>
    </ConditionGroup>
  </div>;
}
```

Preserve these exact label suffixes so existing tests and report operators retain predictable names:

```text
{ariaPrefix} fouling coverage
{ariaPrefix} Slime Only
{ariaPrefix} fouling rating
{ariaPrefix} fouling type
{ariaPrefix} observed rating
{ariaPrefix} observed level
{ariaPrefix} observed type
```

Update the CSS selectors that currently target `.condition-columns label` so `.condition-field` receives the same grid, padding, and border treatment. Do not keep a second derivation path in `PhasePanel`.

- [ ] **Step 4: Add the group editor and child inheritance state**

In `src/App.tsx`, add `GroupConditionPanel` directly above `.phase-stack`. Its props are:

```ts
interface GroupConditionPanelProps {
  report: ReportState;
  section: ReportSection;
  dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]>;
}
```

Use `conditionGroupKey(section)` and `conditionGroupMembers(report.sections, section)` for the current group and member count. Keep a local `draft: Condition` and selected phase. Reset the draft with `cloneCondition()` whenever group key, selected phase, or stored default changes. Render phase tabs only from `section.phases` and dispatch:

```ts
dispatch({
  type: 'APPLY_GROUP_CONDITION',
  sectionId: section.id,
  phase: selectedPhase,
  condition: draft,
});
```

Render the shared editor with `ariaPrefix={`구역 기본 ${selectedPhase}`}`. In `PhasePanel`, render the same editor with `ariaPrefix={phase}` and dispatch `UPDATE_CONDITION`. Pass each phase's source from `report.conditionSources[section.id]?.[phase]`. Render a revert button only for `OVERRIDE` and dispatch `REVERT_CONDITION_TO_GROUP`.

- [ ] **Step 5: Add compact group and source styles**

In `src/styles.css`, add `.group-condition-panel`, `.group-condition-head`, `.group-phase-tabs`, `.condition-source`, and `.condition-revert` rules. Keep the group panel compact, use a neutral inherited badge and amber override badge, and retain the current two-column Condition tables at 1440px.

- [ ] **Step 6: Run focused and related Condition tests**

Run: `pnpm test:run -- src/App.test.tsx src/app/reportState.test.ts src/domain/conditions.test.ts`

Expected: PASS, including AFTER R0, Slime Only derivation, group propagation, override preservation, and revert.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/app/ConditionEditor.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add group condition controls"
```

---

### Task 3: One-click horizontal Section navigator

**Files:**
- Create: `src/app/reportLabels.ts`
- Create: `src/app/reportLabels.test.ts`
- Modify: `src/App.tsx:615-638`
- Modify: `src/App.test.tsx:304-320`
- Modify: `src/styles.css:238-254,403-414`
- Modify: `e2e/demo.spec.ts`

**Interfaces:**
- Consumes: report order and `FOCUS_SECTION` from `ReportState`.
- Produces: `conciseSectionLabel(section: ReportSection): string`.
- Produces buttons named `{fullSectionId} Section 열기`, one of which has `aria-current="page"`.

- [ ] **Step 1: Write failing concise-label tests**

Create `src/app/reportLabels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createGeneralSections, createNicheSections } from '../domain/structure';
import { conciseSectionLabel } from './reportLabels';

describe('report input labels', () => {
  it('formats GENERAL as zone and side', () => {
    expect(conciseSectionLabel(createGeneralSections('CLEANING')[0])).toBe('FWD · PORT');
  });

  it('shortens blade units while retaining other component names', () => {
    const blade = createNicheSections({
      component: 'Propeller Blade', type: 'QUANTITY', quantity: 1, service: 'POLISHING',
    })[0];
    const seaChest = createNicheSections({
      component: 'Sea Chest', type: 'SIDE_QUANTITY', quantity: 1, service: 'INSPECTION',
    })[0];
    expect(conciseSectionLabel(blade)).toBe('PROPELLER 01');
    expect(conciseSectionLabel(seaChest)).toBe('SEA CHEST · PORT · 01');
  });
});
```

- [ ] **Step 2: Run label tests and verify RED**

Run: `pnpm test:run -- src/app/reportLabels.test.ts`

Expected: FAIL because `conciseSectionLabel()` does not exist.

- [ ] **Step 3: Implement concise labels**

Create `src/app/reportLabels.ts`:

```ts
import type { ReportSection } from '../domain/types';

const shortComponent = (component: string): string => {
  if (component === 'PROPELLER BLADE') return 'PROPELLER';
  if (component === 'FIN BLADE') return 'FIN';
  return component;
};

export function conciseSectionLabel(section: ReportSection): string {
  if (section.area === 'GENERAL') return `${section.component} · ${section.side}`;
  const unit = section.unit ? String(section.unit).padStart(2, '0') : null;
  return [shortComponent(section.component), section.side, unit]
    .filter(Boolean)
    .join(' · ')
    .replace('PROPELLER · ', 'PROPELLER ')
    .replace('FIN · ', 'FIN ');
}
```

- [ ] **Step 4: Replace the dropdown test with direct-button navigation**

Replace the existing `switches Sections from the Report Input top bar` test with:

```ts
it('opens any Report Section with one click and keeps sequential arrows', async () => {
  const user = userEvent.setup();
  render(<App />);
  await buildCleaningGeneral(user);
  await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

  const first = screen.getByRole('button', {
    name: 'CLEANING/GENERAL/FWD/PORT Section 열기',
  });
  expect(first).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: '이전 Section' })).toBeDisabled();

  await user.click(screen.getByRole('button', {
    name: 'CLEANING/GENERAL/AFT/BOTTOM Section 열기',
  }));
  expect(screen.getByText('CLEANING/GENERAL/AFT/BOTTOM')).toBeVisible();
  expect(screen.getByRole('button', { name: '다음 Section' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: '이전 Section' }));
  expect(screen.getByRole('button', {
    name: 'CLEANING/GENERAL/AFT/STBD Section 열기',
  })).toHaveAttribute('aria-current', 'page');
});
```

- [ ] **Step 5: Implement the sticky horizontal navigator**

In `ReportInput`, replace `.section-switcher label/select` with:

```tsx
<nav className="section-navigator" aria-label="Report Section 바로가기">
  <button type="button" aria-label="이전 Section" disabled={activeIndex === 0}>←</button>
  <div className="section-strip">
    {props.report.sections.map((section) => {
      const active = section.id === props.activeSection.id;
      return <button
        ref={active ? activeSectionButtonRef : undefined}
        type="button"
        key={section.id}
        className={active ? 'section-tab active' : 'section-tab'}
        aria-label={`${section.id} Section 열기`}
        aria-current={active ? 'page' : undefined}
        onClick={() => props.dispatch({ type: 'FOCUS_SECTION', sectionId: section.id })}
      >
        <span className={`service-badge ${section.service.toLowerCase()}`}>{section.service}</span>
        <b>{conciseSectionLabel(section)}</b>
      </button>;
    })}
  </div>
  <button type="button" aria-label="다음 Section" disabled={activeIndex === props.report.sections.length - 1}>→</button>
</nav>
```

Use one conditional `activeSectionButtonRef`. In an effect keyed by `props.activeSection.id`, call `scrollIntoView({ block: 'nearest', inline: 'center' })`. Keep the full active path visible in `.input-title` and do not wrap the strip.

- [ ] **Step 6: Style the Section strip and update E2E selectors**

Replace `.section-switcher` rules with `.section-navigator`, `.section-strip`, `.section-tab`, and `.service-badge` rules. The strip must use `overflow-x: auto`, `scrollbar-width: thin`, and single-line buttons. Use a filled active tab and visible focus state.

In `e2e/demo.spec.ts`, replace each `getByLabel('Report section').selectOption(sectionId)` with:

```ts
await page.getByRole('button', { name: `${sectionId} Section 열기` }).click();
```

This includes the move verification, mixed Inspection section, QA return, and full-flow section changes.

- [ ] **Step 7: Run label, React, and E2E navigation tests**

Run:

```bash
pnpm test:run -- src/app/reportLabels.test.ts src/App.test.tsx
pnpm test:e2e -- --grep "Inspection exception|UNMATCHED photos"
```

Expected: all selected tests PASS and no `Report section` dropdown remains in Report Input.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/app/reportLabels.ts src/app/reportLabels.test.ts src/App.tsx src/App.test.tsx src/styles.css e2e/demo.spec.ts
git commit -m "feat: add one-click section navigator"
```

---

### Task 4: Explicit photo-folder progress state

**Files:**
- Modify: `src/App.tsx:143-199,293-345,432-444,583-613`
- Modify: `src/App.test.tsx:344-396`
- Modify: `src/styles.css:157-215`
- Modify: `e2e/demo.spec.ts`

**Interfaces:**
- Consumes: `createSectionTree()`, selected `DirectoryHandleLike`, report Sections, photo/match counts, and current status text.
- Produces: local `folderStructureCreated: boolean` and `PhotoSourceProps.structureCreated`.

- [ ] **Step 1: Write a failing progress-state React test**

Add a memory directory helper inside the test and verify all three completion states:

```ts
it('advances folder, structure, and import progress only after each action succeeds', async () => {
  const user = userEvent.setup();
  class MemoryDirectory {
    kind = 'directory' as const;
    children = new Map<string, MemoryDirectory>();
    constructor(public name = '사진') {}
    async getDirectoryHandle(name: string) {
      const child = this.children.get(name) ?? new MemoryDirectory(name);
      this.children.set(name, child);
      return child;
    }
    async *entries(): AsyncGenerator<[string, MemoryDirectory]> {
      yield* this.children.entries();
    }
  }
  vi.stubGlobal('showDirectoryPicker', vi.fn(async () => new MemoryDirectory()));
  const { container } = render(<App />);
  await buildCleaningGeneral(user);

  expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('사진 폴더를 선택하세요');
  await user.click(screen.getByRole('button', { name: '사진 폴더 선택' }));
  expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('폴더 선택 완료 · 사진');
  expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('폴더 구조를 아직 생성하지 않음');

  await user.click(screen.getByRole('button', { name: '표준 폴더 구조 생성' }));
  expect(screen.getByLabelText('사진 입력 진행 상태'))
    .toHaveTextContent('구조 생성 완료 · 15 Sections / 30 Phase folders');

  const fallback = container.querySelector('input[type="file"][webkitdirectory]') as HTMLInputElement;
  await user.upload(fallback, new File(['photo'], 'manual.jpg', { type: 'image/jpeg' }));
  expect(screen.getByLabelText('사진 입력 진행 상태'))
    .toHaveTextContent('사진 불러오기 완료 · 1장 / UNMATCHED 1장');
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Run the progress test and verify RED**

Run: `pnpm test:run -- src/App.test.tsx -t "advances folder"`

Expected: FAIL because the explicit structure state and new progress copy are absent.

- [ ] **Step 3: Add `folderStructureCreated` lifecycle state**

In `App`, initialize `folderStructureCreated` to `false`. Set it to `true` only after `await createSectionTree(folder, report.sections)` resolves. Reset it to `false` in all of these paths:

```text
buildScope
resetScope
selectPhotoFolder after a new handle resolves
```

Do not change it in the error/cancel branches. Pass it to both embedded and standalone `PhotoSource` instances as `structureCreated`.

- [ ] **Step 4: Replace the low-contrast status strip with three concrete result cards**

In `PhotoSource`, derive exactly these display strings:

```ts
const folderResult = props.hasFolder
  ? `폴더 선택 완료 · ${props.folderName}`
  : '사진 폴더를 선택하세요';
const structureResult = props.structureCreated
  ? `구조 생성 완료 · ${props.sections.length} Sections / ${phaseFolderCount} Phase folders`
  : props.hasFolder ? '폴더 구조를 아직 생성하지 않음' : '폴더 선택 후 생성 가능';
const importResult = props.importComplete
  ? `사진 불러오기 완료 · ${props.photoCount}장 / UNMATCHED ${props.unmatchedCount}장`
  : '사진을 아직 불러오지 않음';
```

Render them in one `ol.photo-progress` with `aria-label="사진 입력 진행 상태"`. Each item has a visible step number/check, action title, and result. Apply `.done`, `.current`, or `.pending` from actual state. Keep the three existing action buttons immediately below the matching results, and visually de-emphasize `.demo-strip` once `hasFolder || importComplete` is true.

- [ ] **Step 5: Style the progress cards and current action**

Replace the old `.photo-flow` and redundant `.photo-input-status` presentation with high-contrast `.photo-progress` rules. Completed items use a check marker; the next valid action uses navy or teal fill; disabled steps remain neutral. Preserve the current Scope summary and detailed status/error copy below the progress panel.

- [ ] **Step 6: Extend the directory-tree E2E test**

After folder selection, assert `폴더 선택 완료 · 사진`. Before structure creation, assert `폴더 구조를 아직 생성하지 않음`. After creation, assert `구조 생성 완료 · 15 Sections / 30 Phase folders`. Keep the exact path-count assertions already present.

- [ ] **Step 7: Run photo-source tests**

Run:

```bash
pnpm test:run -- src/App.test.tsx
pnpm test:e2e -- --grep "exact GENERAL directory tree"
```

Expected: PASS; a cancelled or failed folder operation never shows structure completion.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css e2e/demo.spec.ts
git commit -m "feat: clarify photo folder progress"
```

---

### Task 5: Dedicated phase-colored photo assignment target

**Files:**
- Modify: `src/App.tsx:624-660`
- Modify: `src/App.test.tsx:283-302,322-342`
- Modify: `src/styles.css:255-269`
- Modify: `e2e/demo.spec.ts`

**Interfaces:**
- Consumes: existing `activePhotoTarget`, `onSelectPhotoTarget()`, and `activePhotoPhase`.
- Produces: a single header button per phase with `aria-pressed`; selected panels carry `.selected` plus their phase class.

- [ ] **Step 1: Replace the legacy phase-target test with failing visual-state and isolation assertions**

Use this test in `src/App.test.tsx`:

```ts
it('uses a phase-colored header target and Condition edits do not change it', async () => {
  const user = userEvent.setup();
  render(<App />);
  await buildCleaningGeneral(user);
  await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

  const before = screen.getByRole('button', { name: 'BEFORE 현재 사진 배정 위치' });
  expect(before).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('BEFORE 사진 갤러리')).toHaveClass('selected');

  await user.clear(screen.getByLabelText('AFTER fouling coverage'));
  await user.type(screen.getByLabelText('AFTER fouling coverage'), '4');
  expect(before).toHaveAttribute('aria-pressed', 'true');

  await user.click(screen.getByRole('button', { name: 'AFTER 이곳에 사진 배정' }));
  expect(screen.getByRole('button', { name: 'AFTER 현재 사진 배정 위치' }))
    .toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('AFTER 사진 갤러리')).toHaveClass('selected');
});
```

- [ ] **Step 2: Run the phase test and verify RED**

Run: `pnpm test:run -- src/App.test.tsx -t "phase-colored header"`

Expected: FAIL because the selected panel class, new accessible names, and `aria-pressed` state are absent.

- [ ] **Step 3: Implement the dedicated header selector**

Remove `onClick={onSelect}` from the outer `.phase-panel`. Add `selected` to its class list and render this separate header control:

```tsx
<button
  type="button"
  className="phase-select"
  aria-label={`${phase} ${selected ? '현재 사진 배정 위치' : '이곳에 사진 배정'}`}
  aria-pressed={selected}
  onClick={onSelect}
>
  <span>{selected ? '✓ 현재 사진 배정 위치' : '이곳에 사진 배정'}</span>
</button>
```

Keep `사진 추가` adjacent and independent. Add the phase name as a modifier class to `.assignment-target`, and show `conciseSectionLabel(activeSection)` plus the full path. With the panel-level click removed, Condition controls, Report Use, move, delete, and photo-add interactions cannot change the target.

- [ ] **Step 4: Add phase-specific selected styles**

Use these visual families without relying on color alone:

```text
BEFORE: navy/slate selector and selected panel tint
AFTER: teal selector and selected panel tint
CURRENT: blue selector and selected panel tint
```

Set a stronger border, tinted Condition background, visible check/text marker, and focus-visible ring. Remove `.phase-target` rules.

- [ ] **Step 5: Update unmatched assignment tests**

In React and Playwright tests, select AFTER through the new `AFTER 이곳에 사진 배정` button instead of clicking the whole panel. Verify `.assignment-target` contains AFTER and the unmatched photo lands only in `.phase-panel.after`.

- [ ] **Step 6: Run phase and unmatched tests**

Run:

```bash
pnpm test:run -- src/App.test.tsx
pnpm test:e2e -- --grep "UNMATCHED photos"
```

Expected: PASS; editing either phase Condition leaves the selected destination unchanged.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css e2e/demo.spec.ts
git commit -m "feat: clarify active photo destination"
```

---

### Task 6: 12px application typography and consistent photo controls

**Files:**
- Modify: `src/App.tsx:666-679`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css:1-414`
- Modify: `e2e/demo.spec.ts`

**Interfaces:**
- Consumes: existing PhotoRow move/delete/toggle behavior.
- Produces: CSS tokens `--font-ui-xs`, `--font-ui-sm`, `--font-ui-base`, `--font-ui-md`, and `--font-ui-lg`.
- Produces: `.photo-action-buttons`, `.photo-action-button.move`, `.photo-action-button.danger`, `.move-confirm`, and `.move-cancel` controls.

- [ ] **Step 1: Add failing action-markup assertions**

Add this full React test, which loads the existing sample photos before inspecting the card controls:

```ts
it('styles photo action controls consistently', async () => {
  const user = userEvent.setup();
  render(<App />);
  await buildCleaningGeneral(user);
  await user.click(screen.getByRole('button', { name: '샘플 사진 7장 불러오기' }));
  await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

  const move = screen.getAllByRole('button', { name: /이동$/ })[0];
  const remove = screen.getAllByRole('button', { name: /삭제$/ })[0];
  expect(move).toHaveClass('photo-action-button', 'move');
  expect(remove).toHaveClass('photo-action-button', 'danger');
  await user.click(move);
  expect(screen.getByRole('button', { name: '이동 완료' })).toHaveClass('move-confirm');
  expect(screen.getByRole('button', { name: '이동 취소' })).toHaveClass('move-cancel');
});
```

Name the cancel button `이동 취소` to avoid ambiguity with unrelated controls.

- [ ] **Step 2: Run the action test and verify RED**

Run: `pnpm test:run -- src/App.test.tsx -t "styles photo action controls"`

Expected: FAIL because the new classes and cancel accessible name are absent.

- [ ] **Step 3: Update PhotoRow markup**

Wrap normal buttons in `.photo-action-buttons`. Add an `aria-hidden="true"` icon span and visible text to each button. Use these classes:

```tsx
<button
  type="button"
  className="photo-action-button move"
  aria-label={`${photo.file.name} 이동`}
  onClick={() => setMoving(true)}
><span aria-hidden="true">↗</span>이동</button>
<button
  type="button"
  className="photo-action-button danger"
  aria-label={`${photo.file.name} 삭제`}
  onClick={() => dispatch({ type: 'DELETE_PHOTO', photoId: photo.id })}
><span aria-hidden="true">×</span>삭제</button>
```

In move mode, keep both selects at full card width, use `.move-confirm` for `이동 완료`, and `.move-cancel` with `aria-label="이동 취소"`. Preserve the reducer calls exactly. Do not add file deletion or a source-file API call.

- [ ] **Step 4: Add the typography tokens and migrate application selectors**

Add to `:root`:

```css
--font-ui-xs: 10px;
--font-ui-sm: 11px;
--font-ui-base: 12px;
--font-ui-md: 14px;
--font-ui-lg: 16px;
```

Set `body` to `font-size: var(--font-ui-base)`. Audit every `font-size` declaration outside `.report-page`, `.preview-photo`, `.phase-tag`, and `.report-page footer` with this mapping:

```text
5-7px metadata or badge -> --font-ui-xs
8-9px helper or dense label -> --font-ui-sm
10-12px body, button, input, value -> --font-ui-base
card/Section title -> --font-ui-md
panel heading -> --font-ui-lg
existing 18-28px page headings -> retain existing scale
```

Before changing the body baseline, set `.report-page { font-size: 14px; }` so any inherited preview text retains its current computed size. Increase compact application control heights/padding by 15-20% where the new text clips. Keep the 1440px four-column photo grid and the 1120px minimum shell. Do not change the existing explicit document-preview font sizes or sheet geometry.

- [ ] **Step 5: Style photo controls and Report Use**

Apply a 34px minimum height and 12px text to move/delete/confirm/cancel. Use navy outline for move, red-tinted danger styling for delete, navy or teal fill for move-complete, and neutral outline for cancel. Increase `.switch i` and its label to readable sizes while keeping Report Use on the left. Make `.photo-move` a two-row grid when card width cannot fit all controls.

- [ ] **Step 6: Add 1440px computed-style and overflow checks**

Add a Playwright test named `12px application typography keeps photo controls readable without overflow`. Its body calls `buildGeneralScope(page)`, clicks `샘플 사진 7장 불러오기`, enters Report Input, and asserts:

```ts
expect(await page.locator('body').evaluate((node) => getComputedStyle(node).fontSize)).toBe('12px');
expect(await page.locator('.phase-select').first().evaluate((node) => getComputedStyle(node).fontSize)).toBe('12px');
expect(await page.locator('.photo-action-button').first().evaluate((node) => getComputedStyle(node).fontSize)).toBe('12px');
expect((await page.locator('.photo-action-button').first().boundingBox())?.height).toBeGreaterThanOrEqual(34);
expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
await page.getByRole('button', { name: 'Check / Preview' }).last().click();
expect(await page.locator('.report-page').first().evaluate((node) => getComputedStyle(node).fontSize)).toBe('14px');
```

This explicitly proves `.report-page` retains its existing print-oriented baseline after moving to Check / Preview.

- [ ] **Step 7: Run React and 1440px style tests**

Run:

```bash
pnpm test:run -- src/App.test.tsx
pnpm test:e2e -- --grep "12px application typography"
```

Expected: PASS, control heights are at least 34px, and the viewport has no horizontal overflow.

- [ ] **Step 8: Commit Task 6**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css e2e/demo.spec.ts
git commit -m "style: enlarge report workflow controls"
```

---

### Task 7: Integrated regression, build, and public Pages verification

**Files:**
- Modify: `e2e/demo.spec.ts`
- Modify: `README.md` only if visible control names or public verification instructions in the current README no longer match the application.

**Interfaces:**
- Consumes: all behavior delivered by Tasks 1-6.
- Produces: one end-to-end regression that proves group inheritance, direct Section navigation, active phase assignment, repagination, preview, and Word download remain connected.

- [ ] **Step 1: Add the integrated inheritance workflow to E2E**

Add one test using the Polishing set because it contains one Inspection group and multi-Unit Polishing groups:

```ts
test('group defaults preserve unit overrides across direct Section navigation', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByRole('button', { name: 'Polishing 작업 선택' }).click();
  await page.getByRole('button', { name: 'Niche 추가' }).click();
  await page.getByRole('button', { name: 'Scope 만들기' }).click();
  await page.getByRole('button', { name: 'Report Input으로' }).click();

  await page.getByRole('button', {
    name: 'POLISHING/NICHE/PROPELLER BLADE/01 Section 열기',
  }).click();
  await page.getByLabel('구역 기본 BEFORE fouling coverage').fill('15');
  await page.getByRole('button', { name: 'BEFORE 기본값 적용' }).click();

  await page.getByRole('button', {
    name: 'POLISHING/NICHE/PROPELLER BLADE/02 Section 열기',
  }).click();
  await expect(page.getByLabel('BEFORE fouling coverage')).toHaveValue('15');
  await page.getByLabel('BEFORE fouling coverage').fill('40');

  await page.getByRole('button', {
    name: 'POLISHING/NICHE/PROPELLER BLADE/01 Section 열기',
  }).click();
  await page.getByLabel('구역 기본 BEFORE fouling coverage').fill('20');
  await page.getByRole('button', { name: 'BEFORE 기본값 적용' }).click();
  await page.getByRole('button', {
    name: 'POLISHING/NICHE/PROPELLER BLADE/02 Section 열기',
  }).click();
  await expect(page.getByLabel('BEFORE fouling coverage')).toHaveValue('40');
  await page.getByRole('button', { name: 'BEFORE 기본값으로 되돌리기' }).click();
  await expect(page.getByLabel('BEFORE fouling coverage')).toHaveValue('20');
});
```

- [ ] **Step 2: Run the integrated test and verify it passes**

Run: `pnpm test:e2e -- --grep "group defaults preserve"`

Expected: PASS with no browser console or page errors.

- [ ] **Step 3: Run the full automated verification suite**

Run:

```bash
pnpm test:run
pnpm lint
pnpm build
pnpm build:portable
pnpm test:e2e
```

Expected:

```text
Vitest: all tests pass
ESLint: exit 0
vinext build: exit 0
portable Vite build: exit 0
Playwright Edge: all tests pass at 1440x1000
```

- [ ] **Step 4: Inspect the final 1440px screenshots**

Open the generated Report Input and photo-folder screenshots. Confirm all of these visually:

```text
Three folder progress results are readable and unambiguous.
All Section tabs remain one row with horizontal scrolling.
The active Section and active phase are visually obvious without relying only on color.
Group default and child override controls do not crowd the four-column photo grid.
Move/Delete and Report Use controls are readable and aligned.
No application text is visibly clipped and no horizontal viewport scrollbar appears.
Preview sheet typography and geometry are unchanged.
```

- [ ] **Step 5: Update README only when necessary and commit the regression**

If README control names are stale, update only those exact names. Then commit:

```bash
git add e2e/demo.spec.ts README.md
git commit -m "test: verify report input usability flow"
```

If README is already accurate, omit it from `git add` and commit only the E2E change.

- [ ] **Step 6: Push and wait for GitHub Pages deployment**

Run:

```bash
git push origin main
$reportUxRunId = gh run list --workflow deploy-pages.yml --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $reportUxRunId --exit-status
```

Expected: the newest `Deploy private test site` workflow completes successfully and publishes `https://nost13.github.io/underwater-report-demo/`.

- [ ] **Step 7: Verify the public deployment**

In PowerShell, run:

```powershell
$env:DEMO_BASE_URL='https://nost13.github.io/underwater-report-demo/'
pnpm test:e2e
Remove-Item Env:DEMO_BASE_URL
```

Expected: the same Edge suite passes against GitHub Pages, including Scope creation, direct Section navigation, Condition inheritance, photo assignment, pagination, preview, and Word download.
