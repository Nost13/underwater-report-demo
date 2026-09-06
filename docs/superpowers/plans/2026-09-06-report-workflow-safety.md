# Report Workflow Safety Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with test-driven-development. Site owner implements; bounded read-only research/review may be delegated, not checkout edits.

**Goal:** Implement and deploy the approved workflow safety and vessel layout reuse design.
**Architecture:** Add local persistence and pure geometry/reconciliation helpers around the existing React report reducer. Keep Word output on the same report and diagram models as the editor. Extend existing screens rather than replacing the app.
**Tech Stack:** React, TypeScript, IndexedDB, JSZip, Vitest, Playwright, OOXML, existing GitHub Pages portable deployment.
**Spec:** ../specs/2026-09-06-report-workflow-safety-design.md

## Global Constraints

- 선박 위치도 확정 전에는 컨디션을 입력할 수 없다.
- 선박 이미지를 교체해도 기존 도형의 위치·크기·모양을 유지한다.
- 같은 IMO → 같은 선종·LOA/선폭 각각 ±20% → 선종 기본 → 공통 기본. Confirmed unique-IMO samples only; 1–2 reference, 3+ mean; 5+ MAD guard per spec.
- Keep data local. Never publish customer photos or draft archives. Preserve current report order, blank matrix areas, 12 niche ordering, Fin Blade exclusion, circles, fixed Word frames, and caption/filename rules.
- Work Window: `16 Hours + 1 Hrs`; Working Time: `0 Hrs 49 Min`; manual edits survive source edits.
- Preserve existing user code; use the existing isolated worktree. No cloud storage/new Site migration. Current public GitHub Pages destination is user-authorized.

## Task 1 — Persistence and recovery

Files: create `src/persistence/archive.ts`, `draftStore.ts`, `useDraftStorage.ts`, `src/app/DraftToolbar.tsx`; modify `src/App.tsx`, reducer hydration; tests `archive.test.ts`, browser recovery coverage.
Interface: archive `packArchive(value: unknown): Promise<Blob>`, `unpackArchive(file: Blob): Promise<unknown>`; store versioned records `{id, revision, updatedAt, title, value, previous}` with compare-and-swap revisions. Hook accepts snapshot and restore callback; returns recovery list, saved timestamp, error, new/load/import/export actions.
- [x] Test first: serialize a nested File with non-ASCII filename, restore bytes/name/type/lastModified; malformed/version/asset-reference/size errors reject before state mutation.
```ts
const file = new File(['photo bytes'], '선박.jpg', {type:'image/jpeg',lastModified:123});
const restored = await unpackArchive(await packArchive({photo:file}));
expect(restored.photo.name).toBe('선박.jpg');
expect(await readBlob(restored.photo)).toEqual(new TextEncoder().encode('photo bytes'));
```
- [x] Run failing tests with `node node_modules/vitest/vitest.mjs run src/persistence`.
- [x] Implement manifest+bounded asset ZIP serialization, validated hydration, transactional IndexedDB saves preserving previous state, startup chooser and guarded debounce. Never auto-overwrite startup data. Restore Files, not object URLs or directory grants. Fail visibly on quota/conflict.
- [x] Integrate complete App snapshot and toolbar. Add real browser reload/restore/conflict test and rerun focused tests.
- Commit checkpoint consolidated with the final integration release.

## Task 2 — Views, geometry preservation and saved/mean recommendations

Files: `src/vesselDiagram/types.ts`, `geometry.ts`, `composer.ts`, new `layoutLibrary.ts`, `src/app/VesselDiagramEditor.tsx`, new `VesselDiagramWorkspace.tsx`, Word per-section view resolution, persistence library UI. Tests adjacent to helpers/editor/composer.
Interface: optional image transform on a backward-compatible side config; side/bottom view resolver by section. Library records contain IMO, type, LOA, breadth, view, confirmed timestamp, per-marker representative/version flags. `recommendLayout(target, records, markers)` returns per-marker origin/sample count/rect and held-out records.
- [x] Tests first: replacing only image leaves exact marker rectangles; hull-normalized sample centers .2/.3/.4 average .3; duplicated IMO does not add a vote; mismatched type/view/count excluded; circles stay circular; rejected outlier retains previous representative.
```ts
expect(recommendLayout(target, threeUniqueVessels, markers).markers[0].rect.x).toBeCloseTo(.3);
expect(recommendLayout(target, repeatedOneVessel, markers).markers[0].sampleCount).toBe(1);
```
- [x] Run focused tests red; implement pure normalization, explicit type aliases, bounded mean/MAD and source labels.
- [x] Implement independent background image transforms, optional bottom view and explicit per-section routing; preserve markers on replace, re-confirm on change. Same view resolver/transform in editor preview and Word.
- [x] Store confirmed IMO history and per-key representatives, separate type-default action, preview/apply/revert and archive merge. No automatic overwrite or copying old conditions.
- [x] Run focused and browser/Word geometry regression checks. Commit checkpoint consolidated with Task 6.

## Task 3 — Scope and condition safety

Files: reducer, `src/app/scopeRevision.ts`, `App.tsx`, domain QA/types and tests.
Interface: `reconcileScope(state: ReportState, sections: ReportSection[]): ReportState`; `conditionReviews?: Record<sectionId, Partial<Record<Phase,boolean>>>`; reducer HYDRATE/REVISE_SCOPE/CONFIRM_CONDITION/ASSIGN_PHOTOS actions.
- [x] Tests first: removing one section unassigns its photos but preserves caption/order, retained semantic keys keep condition/labels, changing service is a fresh section, batch order appends predictably, updates invalidate review.
```ts
expect(reconcileScope(oldState, retainedSections).photos[0]).toMatchObject({sectionId:null,captionText:'keep'});
```
- [x] Run red then implement meaning-key mapping, review preservation/invalidation and explicit Scope diff/confirmation/undo in UI.
- [x] Mark group drafts dirty; navigation apply/discard/stay. Derive completion from reviewed phases/photos, add next incomplete. Guard every path with confirmed required views.
- [x] Run reducer/UI tests. Commit checkpoint consolidated with Task 6.

## Task 4 — Operations, lookup, personnel and result wording

Files: reportInfo/ReportInformation, App lookup handlers, summaryModel/summaryWriter/templateWriter, new OverallResultEditor; adjacent tests.
Interfaces: `operationModes` AUTO/MANUAL map for workWindow/workingTime/position; personnel role/count modes; `OverallResultOverride {headline,narrative,sourceFingerprint}` on ReportInfo; optional reviewed-phase map to generated wording.
- [x] Tests first: source cleared removes AUTO duration, source change preserves MANUAL duration, explicit AUTO reset calculates, stale lookup cannot overwrite current edits, removal+rating wording references only recorded facts, override survives edits and reaches Word.
```ts
expect(deriveOperationValues({...operation,etd:''},'etd').workWindow).toBe('');
```
- [x] Run red then implement editable mode controls, manual vessel start, job-date/candidate schedule apply and late-request guard; role assignment and count mismatch advisory.
- [x] Implement deterministic service-aware title/body and accessible edit dialog with save/cancel/reset/stale notice, same value passed to Word. No summary matrix redesign.
- [x] Run focused unit/component/OOXML tests. Commit checkpoint consolidated with Task 6.

## Task 5 — Photo library and complete-report checks

Files: App PhotoSource/ReportInput/UnmatchedCard/CheckPreview/ExportScreen, new PhotoLibraryPicker, CoverEditor, ReportInformation, CSS, QA.
- [x] Tests first: Ctrl/Shift/checkbox selection assigns selected photos in order to displayed target; removing from detail unassigns without dropping original; cover/readiness references do not steal detail assignment; current JobNo preview; severity routes to correct input.
- [x] Implement direct import vs optional folder setup, common library picker, two readiness slots each, excluded vs unmatched filters, group dirty warning integration and actual progress.
- [x] Add full-report outline/readiness check, severity and final required-issue gate while preserving intentional matrix blanks. Never label detail page count as whole-document count.
- [x] Run covering UI and output tests. Commit checkpoint consolidated with Task 6.

## Task 6 — Integration, review and deployment

- [x] Final Vitest: 51 files / 454 tests passed. TypeScript, scoped ESLint, diff check and portable production build passed.
- [x] Real Edge browser: manual vessel, confirmation gate, image replacement, group apply/stay, batch photos, independent cover/readiness references, manual/auto times, summary override, Word download, recovery, two-tab conflict and ZIP restore. Scope/mean/bottom also covered by focused unit regressions. Synthetic QA only.
- Verification limitation: complete DOCX generated and package/XML-inspected; existing frame/order/caption tests retained. Bundled LibreOffice unavailable. Two isolated hidden Word PDF attempts stalled; QA-only Word instances were closed without saving. Full page-by-page Word/PDF visual inspection remains unverified and must be disclosed.
- [x] Two read-only final reviews approved after P1/P2 fixes; final source re-verification running.
- [ ] Publish exact validated commit through existing `.github/workflows/deploy-pages.yml`; verify workflow success and public deployed source version. Do not migrate hosting.

## Evidence / Progress

- Baseline commit: 1d7d044. Existing isolated worktree; clean at start.
- Package runner attempted an unnecessary install and aborted without source changes; run the already installed Node tool entrypoints directly.
- Functional implementation checkpoints are complete. Deployment is tracked separately; page-render verification limitation is explicitly recorded and must not be claimed as passed.
- Baseline: 40 files / 420 tests passed. New persistence/archive validation, scope reconciliation, view composer/library, operation modes, summary wording, photo selection and full QA helpers implemented with focused checks.
- 2026-09-06 22:49 integration: initial full run 395 passed / 49 failed; most App failures traced to a stale confirmation closure that blocked the editor's save-and-next path. Removed the redundant closure check; existing gate regression now passes. Rail/input/export/restore gates remain. Remaining old-expectation tests and full browser/Word QA are in progress.
- Read-only persistence review found reference-only snapshot comparison, conflict-recovery dead end, validation gaps, stale vessel responses and unsaved Scope-only drafts. Added content fingerprint, backup escape, stronger nested validation, generation invalidation and broader draft detection. Toolbar integration tests still required.
- Final verification: real Edge end-to-end workflow passed (manual job, image replacement, gated conditions, group navigation, photo references, result override, original File recovery, archive import, two-tab CAS conflict, exact Word filename and XML content). Synthetic artifacts stay ignored under outputs/.
- Real-template assembly cases exceeded the former 30s limit (25–35s observed). Raised only that three-case test budget to 60s without changing assertions; the complete suite then passed.
- Two read-only final reviews approved the corrected persistence, Scope and per-view gates. No P1/P2 remained in reviewed scope.
- Validation complete except the explicitly recorded Word/PDF visual-render limitation. Release commit and existing GitHub Pages publication are the next step; no customer data is staged.
