# Report Editing Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Site source edits stay with the owning agent; independent research/review may be delegated.

**Goal:** Implement all 16 approved improvements, rectangular bilge keels, present-only web matrices and safe incomplete Word export.

**Architecture:** Extend the existing local snapshot and diagram models without replacing the application. Separate reusable personnel, marker, photo insertion and summary editing logic from the large App component. Retain one shared condition model and marker resolver for preview and Word.

**Tech Stack:** React 19, TypeScript, Vite portable build, IndexedDB, JSZip, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-07-report-editing-usability-design.md`

## Execution status — 2026-09-07

- Tasks 1–4 implemented and independently reviewed. The checklist below retains the original planned sequence; this status records actual delivery.
- Actual styling file: `src/editing.css`, imported by both application entry points (not `src/App.css`).
- Actual extracted summary component: `src/app/SummaryReview.tsx`; source selection is kept inside that component, using shared `finalPhase` and `buildSummaryModel`.
- Integration uses one source commit because all four tasks share App and snapshot contracts; the design was committed separately before implementation.
- Review fixes preserve custom markers through resets, validate null entries, assign new Hull markers to the correct collection, clamp photo panel widths and retain responsive photo overlays.
- Browser visual inspection caught and corrected grouped matrix header column widths. Added explicit column widths and a narrow-screen horizontal-scroll fallback.
- Final verification and deployment evidence are recorded in the companion release verification report. The original per-task commit checkpoints below are superseded by the integration commit.

## Global Constraints

- 빌지킬은 직사각형이다. 기존 타원형 빌지킬도 위치와 크기를 유지하면서 직사각형으로 전환한다.
- Word의 고정 양식과 없는 구역의 빈칸 유지 규칙은 변경하지 않는다.
- 위치도 확정 전 컨디션 입력 금지는 유지한다.
- 기존 작업·사진·순서·컨디션·수동 문구·배치 기록을 보존한다.
- Customer data stays local. No new packages, accounts or hosting migration.
- Each task follows failing behavior test → minimal implementation → passing focused tests → review/commit. Run the full suite and portable build after integration.

## Task 1 — Personnel and input layout

Files: `src/app/personnelLibrary.ts`, `src/app/PersonnelRegistration.tsx`, `src/app/ReportInformation.tsx`, `src/app/diverQualifications.ts`, `src/app/reportInfo.ts`, `src/persistence/reportSnapshot.ts`, `src/persistence/draftStore.ts`, `src/App.tsx`, `src/App.css`; tests beside the new modules and `ReportInformation.test.tsx`.

Interfaces: `personnelKey(person): string`; `validatePersonnelLibrary(value): DiverQualification[]`; `mergePersonnelLibrary(existing,incoming): DiverQualification[]`. Optional `id` on qualifications; optional `personnelLibrary` on ReportInfo carries backup data. Store local library using its own IndexedDB record and optimistic revision, never overwrite conflict data.

- [ ] Write registration tests: absent name cannot register, certificate-less distinct people get independent IDs, duplicate certificate/name is rejected, existing report selections do not mutate after registry edits.
- [ ] Run `node node_modules/vitest/vitest.mjs run src/app/personnelLibrary.test.ts src/app/ReportInformation.test.tsx` and observe missing registration behavior.
- [ ] Extend search to accept a combined source; use `person.id ?? certificateNo` for selection identity, and never fabricate certificates.
- [ ] Implement registration modal, explicit save/add, errors and local registry backup/restore. Populate the report's library snapshot so existing backup packing handles bytes/data uniformly.
- [ ] Consolidate schedule selection; keep a single candidate select with explicit apply and selected details. Increase input sizing and align operation mode and Scope action rows through scoped CSS.
- [ ] Run focused tests, type check and commit the completed task.

## Task 2 — Diagram shapes, numeric input and bindings

Files: `src/vesselDiagram/types.ts`, `geometry.ts`, `markers.ts`, `layoutLibrary.ts`, `src/persistence/validateDiagram.ts`, `reportSnapshot.ts`, `src/app/VesselDiagramEditor.tsx`, `VesselDiagramWorkspace.tsx`, `VesselDiagramPreview.tsx`, new `MarkerManager.tsx`, `PercentControl.tsx`, `src/docx/templateWriter.ts`; tests in the same folders.

Interfaces: optional `label`/`custom` on ZoneMarker; optional `markerBindings: Record<string,string[]>` and `removedMarkerIds: string[]` on VesselDiagramConfig. `resolveMarkerIds(section, config?)` returns explicit bindings when present, including an explicitly empty mapping; otherwise legacy defaults. `normalizeDiagramShapes(config)` changes only legacy bilge shape and recurses through bottom view.

- [ ] Test bilge RECTANGLE generation and old-shape conversion with unchanged rect, binding precedence including empty bindings, invalid/duplicate binding data rejection, and Scope reconcile preserving custom markers.
- [ ] Run focused geometry/marker/library/snapshot tests and observe requested behavior failures.
- [ ] Add numeric percent controls with finite/range validation on blur/Enter and synchronized range inputs; aspect ratio updates share a single callback.
- [ ] Implement marker add/edit/remove with explicit section checkboxes; capture effective bindings before editing and preserve other markers/connections. Removed defaults stay removed after reconcile until explicitly reset.
- [ ] Update label callouts, required markers, validation, preview, Word and saved-layout loading to use the same config-aware resolver and shape normalization. Unknown/custom IDs do not enter unrelated average samples.
- [ ] Test add/edit/undo/reload, existing/bottom view and circle invariants, then commit.

## Task 3 — Photo assignment and folders

Files: `src/app/photoInsertion.ts`, `src/app/PhotoPanelSettings.tsx`, `src/app/FolderContents.tsx`, `src/browser/directory.ts`, `src/App.tsx`, `src/App.css`, `src/App.test.tsx`, `e2e/workflow-safety.spec.ts`.

Interfaces: `insertionBeforeId(ids, draggedId, targetId, edge: 'BEFORE'|'AFTER'): string|null` yields the reducer's existing insertion target after excluding the dragged item. Photo panel preferences are local 1–4 columns plus bounded width.

- [ ] Write literal ordering tests for forward/backward movement, adjacent/self target, first/last insertion and the after edge.
- [ ] Run `node node_modules/vitest/vitest.mjs run src/app/photoInsertion.test.ts` and observe failure.
- [ ] Render insertion lines between photos using pointer position; dispatch existing REORDER_PHOTO with the resolved target. Keep keyboard sorting and captions intact.
- [ ] Add panel column/width controls, visible current destination, high-contrast assign buttons and responsive overlay fallback.
- [ ] Add generated-folder contents viewer and a reselect action starting at the selected handle where supported; permission/cancel failure preserves state. Do not claim to launch Explorer.
- [ ] Remove demo generation controls and handlers; replace UI-test sample shortcuts with synthetic file uploads.
- [ ] Run photo/reducer/App tests and commit.

## Task 4 — Summary editing and incomplete export

Files: new `src/app/SummaryWorkspace.tsx`, `src/summary/summaryEditing.ts`, `src/app/OverallResultEditor.tsx`, `src/App.tsx`, `src/app/reportState.ts`, `src/App.css`; tests beside new files and App/export tests.

Interfaces: summary edit target is an explicit section ID and its final phase; edits dispatch existing UPDATE_CONDITION and retain review invalidation. Matrix rows remain derived using `buildSummaryModel`.

- [ ] Test Hull-only/Niche-only/mixed and Rating 0 rendering, source-section choice for aggregated rows, and changed source reflected in both summary values and Word input.
- [ ] Run tests and verify missing edit/split-table behavior.
- [ ] Extract SummaryWorkspace; render separate nonempty Hull/Niche tables, edit modal using ConditionEditor and explicit source/phase selection, with diagram gate still enforced.
- [ ] Change result headline to a full-width multiline field and style semantic actions and focus states.
- [ ] Test cancelled/confirmed incomplete exports and unconfirmed diagram exclusion, while keeping condition stage blocked.
- [ ] Decouple output navigation from condition navigation; remove issue-count disable, confirm missing items at export time, pass no unconfirmed diagram to writer. Retain real runtime failure handling and naming.
- [ ] Run focused tests and commit.

## Task 5 — Integration and release

- [ ] Run `node node_modules/vitest/vitest.mjs run`, `node node_modules/typescript/bin/tsc --noEmit`, scoped ESLint and `git diff --check`.
- [ ] Exercise approved browser QA with synthetic personnel/photos: register/reload, diagram add/link/rectangle, input lock, columns and drag insertion, summary edit, incomplete output, backup/restore.
- [ ] Inspect representative Word XML and render pages where available; report any rendering limitation distinctly from content checks.
- [ ] Run `node node_modules/vite/bin/vite.js build --config vite.portable.config.ts`.
- [ ] Review exact changed paths for customer data and regressions; publish the validated build to the existing authorized GitHub Pages workflow and verify workflow success, current asset and public HTTP response.

## Self-review

Coverage: task 1 covers requests 1–4, task 2 covers 5–7 and rectangular bilges, task 3 covers 8–12, task 4 covers 13–16 and present-only web matrix. Task 5 verifies persistence and output contracts across all four. No data-sharing expansion or template redesign is required.
