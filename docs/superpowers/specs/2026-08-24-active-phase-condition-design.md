# Active Phase Photo Assignment and Condition Design

## Goal

Make photo assignment a target-first desktop workflow and replace the single phase condition with report-aligned Fouling and Observed condition groups.

## Photo assignment

`ReportState.focusedSectionId` continues to select the visible Section. A new UI-only active target is `{ sectionId, phase }`, initialized to the visible Section's first phase. Clicking a phase panel makes that phase the target. The UNMATCHED drawer shows only photos; clicking a photo assigns it to the active target. The drawer does not expose per-photo Section or Phase selectors.

The active target is visually distinct and announced as `현재 사진 배정 위치`. Direct local photo upload remains available from each phase panel and targets that panel. Existing assigned-photo `이동` and `삭제` actions stay intact.

## Condition model

Each phase has two independent condition groups.

| Group | Editable values | Derived value |
| --- | --- | --- |
| Fouling | type, surface coverage | rating 0-5 |
| Observed | type, level | rating 1-5 |

Fouling rating is derived only from coverage: `0% → 0`, `1-100% / slime only → 1`, `1-5% → 2`, `6-25% → 3`, `26-50% → 4`, `51-100% → 5`. Observed rating is derived only from level: `Normal / Trace → 1`, `Minor Observation → 2`, `Notable Observation → 3`, `Significant Observation → 4`, `Critical Observation → 5`.

AFTER defaults to Fouling `Clean / 0% / 0`; BEFORE and CURRENT start empty. Observed values start empty so a non-observation is not silently represented as an observation. Derived ratings are shown as read-only colored badges.

## Validation, caption, preview, and PDF

Report Check treats a phase condition as complete when the Fouling type and coverage are supplied. Observed fields are optional as they describe exceptions. Captions, preview footers, and PDF condition lines use a compact Fouling / Observed summary. Legacy `class`, `rating`, and `detail` properties are replaced throughout the demo so there is one source of truth.

## Constraints

- PC-first Chrome/Edge demo; File references and local-only storage remain unchanged.
- Existing BEFORE/AFTER page grouping and automatic pagination remain unchanged.
- No server storage and no source-file deletion.

