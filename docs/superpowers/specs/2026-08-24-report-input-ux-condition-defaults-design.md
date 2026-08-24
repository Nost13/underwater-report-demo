# Report Input UX and Group Condition Defaults Design

## Goal

Make the PC-first workflow readable at 1440px, reduce Section navigation to one click, make the active photo destination visually unmistakable, and let a Service/Component group provide phase-specific Condition defaults while preserving per-Section exceptions.

The change covers six related areas:

1. photo-folder progress clarity;
2. one-click Report Input Section navigation;
3. group Condition defaults with child overrides;
4. phase-colored photo assignment targets;
5. a 12px-based application typography scale; and
6. consistent photo move/delete controls.

## Scope and constraints

- The application remains desktop-first for Windows Chrome/Edge at a 1440px reference width.
- Vessel lookup remains verification-only. Photos, Conditions, and generated reports remain local to the browser.
- Source photos remain `File` references. This change does not introduce Base64 source storage or server persistence.
- Inspection continues to use `CURRENT`; other Services continue to use `BEFORE` and `AFTER`.
- AFTER continues to initialize as Clean / R0 with Observed Normal / Trace.
- Existing pagination, Report Use, QA, preview, and Word template rules remain unchanged.
- The typography change applies to the web application chrome and controls. It does not alter the Word template or the print-accurate document preview layout.

## 1. Photo-folder progress

The current low-contrast status strip will become a three-state progress panel. Each step has an icon/state marker, a primary label, and a concrete result.

| Step | Pending state | Complete state |
| --- | --- | --- |
| Folder | `사진 폴더를 선택하세요` | `폴더 선택 완료 · {folderName}` |
| Structure | `폴더 선택 후 생성 가능` | `구조 생성 완료 · {sectionCount} Sections / {phaseFolderCount} Phase folders` |
| Import | `사진을 아직 불러오지 않음` | `사진 불러오기 완료 · {photoCount}장 / UNMATCHED {unmatchedCount}장` |

The current step uses a strong navy or teal surface and larger text. Completed steps use a check marker; pending steps remain neutral. The next valid action is visually primary, while unavailable actions remain disabled.

`folderStructureCreated` is explicit UI state. It becomes true only after `createSectionTree` succeeds and resets when the Scope or selected folder changes. A failed or cancelled folder operation never marks a step complete.

The sample-photo action remains available as a secondary demo utility below the real workflow and is visually de-emphasized once a real folder has been selected or photos have been imported.

## 2. One-click Section navigation

The native Report Input dropdown is replaced by a sticky horizontal Section navigator.

- Every Report Section is a directly clickable button in report order.
- The button shows a concise physical label such as `ROPE GUARD`, `PROPELLER 01`, `BOSS CAP`, or `FWD · PORT`.
- A compact Service badge distinguishes Inspection, Cleaning, Polishing, Repair, and Removal.
- The active Section has a strong filled state and `aria-current="page"`.
- The full Section path remains visible below the navigator for verification.
- Previous and next buttons remain at the two ends for sequential entry.
- The strip scrolls horizontally instead of wrapping into multiple rows, and the active item scrolls into view when focus changes.
- Each button's accessible name contains the full Section identifier.

This provides direct one-click navigation without reducing the photo workspace width. Report order and `focusedSectionId` remain the single source of truth.

## 3. Group Condition defaults and child overrides

### Group boundary

A Condition group is identified by:

```text
Service + Area + Component
```

The implementation uses one centralized `conditionGroupKey(section)` helper built from a normalized tuple, not a concatenated display path. This prevents component names or path separators from creating key collisions.

The group includes every Side and Unit under that key.

Examples:

- `POLISHING + NICHE + PROPELLER BLADE` includes Propeller Blade Units 01-06.
- `CLEANING + GENERAL + FWD` includes FWD PORT, STBD, and BOTTOM.
- Inspection and Polishing for the same physical Component remain separate groups because their phases and reporting intent differ.

Defaults are phase-specific. A BEFORE default never changes AFTER or CURRENT, and an action applies only to members that contain the selected phase.

### State model

`ReportState` gains two local-only maps:

```ts
conditionDefaults: Record<GroupKey, Partial<Record<Phase, Condition>>>
conditionSources: Record<SectionId, Partial<Record<Phase, 'GROUP' | 'OVERRIDE'>>>
```

Group defaults initialize from the existing Service phase defaults. BEFORE and CURRENT start with empty Fouling and Observed Normal / Trace; AFTER starts Clean / R0 and Observed Normal / Trace.

Creating or resetting Scope rebuilds both maps from the new Section list. Newly created Sections therefore cannot retain an override or group default from an earlier Scope.

`ReportSection.conditions` continues to hold the effective Condition used by QA, preview, captions, pagination consumers, and Word export. No exporter-specific inheritance resolution is required.

### Update rules

- Applying a group default stores the complete Fouling and Observed Condition for that group and phase.
- It copies the Condition to every group member whose source is `GROUP`.
- Members already marked `OVERRIDE` remain unchanged.
- Editing any Condition control inside a child Section marks that entire Section/Phase Condition as `OVERRIDE`.
- `기본값으로 되돌리기` copies the current group default into the child and changes its source back to `GROUP`.
- Updating a group default later therefore updates only non-overridden children.
- Different Services, Components, Areas, and phases never inherit from one another.

The group editor appears above the phase panels as a compact `구역 기본 Condition` panel. It identifies the current group and member count, provides CURRENT or BEFORE/AFTER tabs as applicable, reuses the existing Fouling and Observed controls, and has an explicit `기본값 적용` action. Child phase panels display either `기본값 사용` or `개별 수정`, with the revert action shown only for overrides.

Incomplete group Conditions may remain visible while being edited. Existing QA rules continue to report a missing Condition until the effective Fouling coverage/type is complete.

## 4. Photo assignment target

The small `사진 배정 대상` button is removed. The phase header becomes a large destination selector while `사진 추가` remains a separate adjacent action.

- BEFORE uses a navy/slate selected surface.
- AFTER uses a teal selected surface.
- CURRENT uses a blue selected surface.
- The selected panel receives a matching tinted background, stronger border, and `현재 사진 배정 위치` marker.
- Unselected headers use the action text `이곳에 사진 배정`.
- The top assignment summary uses the same phase color and a concise physical Section label plus the full path.
- Selecting a phase does not change its Condition or photos.

Condition inputs, photo buttons, and Report Use controls stop click propagation so editing them cannot accidentally change the destination. The dedicated phase selector remains the only assignment-target control.

## 5. Typography and control scale

The application adopts shared typography tokens instead of isolated 5-10px declarations.

| Token | Size | Use |
| --- | --- | --- |
| `--font-ui-xs` | 10px | secondary metadata, compact badges, photo index |
| `--font-ui-sm` | 11px | helper text and dense labels |
| `--font-ui-base` | 12px | body copy, buttons, inputs, table values |
| `--font-ui-md` | 14px | card and Section titles |
| `--font-ui-lg` | 16px | panel headings |
| Existing large scale | 18-28px | page and workflow headings |

Functional UI text must not be smaller than 10px. Buttons, inputs, toggles, and compact rows increase in height and padding by approximately 15-20% where necessary. The 1440px layout may become vertically longer, but it must not introduce horizontal viewport overflow or reduce photo thumbnails below their current usable width.

Document preview sheets and Word output retain their current print-oriented dimensions and font sizing.

## 6. Photo move and delete controls

Photo-card actions follow the same 12px control system.

- `이동` is a neutral outlined secondary button with a move icon.
- `삭제` is a red-tinted danger button with a delete icon.
- Both use a 34px minimum height, consistent radius, padding, hover, and focus-visible states.
- Report Use remains on the left and increases to the new readable label/toggle size.

When move mode is open:

- Section and Phase selectors use the full card width and the base input size.
- `이동 완료` is the primary action.
- `취소` is a neutral secondary action.
- The controls use a two-row responsive grid when the card is too narrow for one row.

Deleting a report photo keeps the existing behavior: it removes only the browser report reference and never deletes the source file.

## Data flow

1. Scope creation initializes Sections, group defaults, and `GROUP` sources.
2. The horizontal navigator dispatches `FOCUS_SECTION`.
3. The current Section determines the visible group and group-default panel.
4. `APPLY_GROUP_CONDITION` updates the group default and only non-overridden effective Section Conditions.
5. Existing child controls dispatch `UPDATE_CONDITION`, which also marks the Section/Phase as `OVERRIDE`.
6. `REVERT_CONDITION_TO_GROUP` restores the current default and source.
7. QA, preview, captions, and Word export continue reading effective `ReportSection.conditions`.
8. Photo-target selection and photo-card actions remain independent of Condition inheritance.

## Error handling and accessibility

- Folder creation/import errors remain visible in the progress panel and do not advance completion state.
- All navigator and phase target buttons expose full accessible names and visible focus states.
- Color is never the only status signal; text and check/override markers accompany it.
- Active Section and active phase use `aria-current` or `aria-pressed` as appropriate.
- Horizontally scrollable navigation remains keyboard operable.
- Danger styling distinguishes deletion, but source-file safety remains stated in the UI.

## Testing

### Domain and reducer

- Group keys isolate Services, Areas, and Components while combining Side/Unit children.
- Group defaults apply only to matching phases and non-overridden children.
- Child edits mark overrides.
- Later default changes preserve overrides.
- Revert restores the latest group default.
- Effective Conditions continue to drive QA and Word report models.

### React integration

- Folder, structure, and import steps show accurate pending/complete states.
- Every Section is directly focusable from the navigator in one click.
- Previous/next navigation and report order remain correct.
- Active phase color/state follows the selected photo target.
- Condition input clicks do not switch the photo target.
- Group default, override badge, and revert behavior are visible and operable.
- Move, delete, move-complete, cancel, and Report Use controls expose readable labels and states.

### Browser verification

- Run the complete Windows Edge flow at 1440px.
- Verify no horizontal viewport overflow after typography enlargement.
- Verify the Section strip scrolls and keeps the active Section visible.
- Verify folder progress, mixed Inspection/Polishing navigation, Condition inheritance, photo assignment, repagination, preview, and Word download.
- Re-run the public GitHub Pages flow after deployment.

## Success criteria

- No normal workflow text is rendered below 10px; primary UI copy and controls use the 12px base.
- A user can jump directly to any Report Section with one click.
- The active photo destination is identifiable without relying on the small legacy button.
- One group Condition entry can populate matching child Sections while exceptions survive subsequent default changes.
- Photo move/delete actions match the application design system and remain source-file safe.
- Existing local-only storage, phase, pagination, QA, preview, and Word rules continue to pass automated and 1440px browser verification.
