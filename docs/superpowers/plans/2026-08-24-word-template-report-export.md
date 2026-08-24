# Word Template Report Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Download one browser-generated Word report that fills the supplied Detail Service Record template once per report phase, retaining its header and footer.

**Architecture:** Replace category-based fouling input with a percentage plus a Slime Only flag. Build a phase-first export model that maps a section, phase, conditions, and ordered local image Files to template values. A client-side OOXML writer copies the bundled DOCX package, replaces placeholders, creates sequential JPEG media and relationships, and appends continuation template bodies without changing header/footer parts.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright, JSZip, browser Canvas/ImageBitmap APIs, OOXML/DOCX.

**Spec:** \`docs/superpowers/specs/2026-08-24-word-template-export-design.md\`

## Global Constraints

- Keep all report data, Files, image processing, and Word generation in the browser; do not add server storage or an upload API.
- Bundle the supplied template at \`public/templates/Detail_report_template.docx\`; source header/footer, styles, theme, and artwork must remain unchanged.
- Normal services export BEFORE pages before AFTER pages; Inspection exports CURRENT only.
- A phase fills P1–P4 on its first page and six slots per continuation page thereafter; a phase without Report Use photos produces no page.
- Fouling coverage is a numeric whole percentage from 0 through 100; type and rating are derived. Slime Only is a distinct toggle and derives R1 for 1–100%.
- Observed defaults to Normal / Trace (R1); blank observed type exports as \`-\`.
- \`{{SIDE_LABEL}}\` is PORT SIDE, STBD SIDE, BOTTOM, or blank for side-less components.

---

### Task 1: Replace coverage categories with percentage-derived conditions

**Files:**
- Modify: \`src/domain/types.ts\`
- Modify: \`src/domain/conditions.ts\`
- Modify: \`src/domain/conditions.test.ts\`
- Modify: \`src/app/reportState.ts\`
- Modify: \`src/App.tsx\`
- Modify: \`src/App.test.tsx\`

**Interfaces:**
- Produces \`Condition['fouling'] = { coverage: number | null; slimeOnly: boolean; type: FoulingType }\`.
- Produces \`deriveFoulingCondition(coverage: number | null, slimeOnly: boolean): { rating: string; type: FoulingType }\`.
- Consumed by report summary, QA, Word mapping, and phase input.

- [x] **Step 1: Write the failing domain tests for every boundary**

\`\`\`ts
expect(deriveFoulingCondition(0, false)).toEqual({ rating: '0', type: 'Clean / No Fouling' });
expect(deriveFoulingCondition(1, false).rating).toBe('2');
expect(deriveFoulingCondition(5, false).rating).toBe('2');
expect(deriveFoulingCondition(6, false).rating).toBe('3');
expect(deriveFoulingCondition(25, false).rating).toBe('3');
expect(deriveFoulingCondition(26, false).rating).toBe('4');
expect(deriveFoulingCondition(51, false).rating).toBe('5');
expect(deriveFoulingCondition(70, true)).toEqual({ rating: '1', type: 'Micro fouling' });
\`\`\`

- [x] **Step 2: Run the targeted test to verify it fails**

Run: \`pnpm vitest run src/domain/conditions.test.ts\`

Expected: FAIL because the percentage-derived function does not exist.

- [x] **Step 3: Implement the numeric model and helpers**

\`\`\`ts
export function deriveFoulingCondition(coverage: number | null, slimeOnly: boolean) {
  if (coverage === null) return { rating: '', type: '' as FoulingType };
  if (coverage === 0) return { rating: '0', type: 'Clean / No Fouling' as FoulingType };
  if (slimeOnly) return { rating: '1', type: 'Micro fouling' as FoulingType };
  if (coverage <= 5) return { rating: '2', type: 'Light Macro fouling' as FoulingType };
  if (coverage <= 25) return { rating: '3', type: 'Medium Macro Fouling' as FoulingType };
  if (coverage <= 50) return { rating: '4', type: 'Heavy Macro fouling' as FoulingType };
  return { rating: '5', type: 'Severe Macro Fouling' as FoulingType };
}
\`\`\`

Update \`emptyCondition\`, \`cleanCondition\`, summaries, and reducer merging so AFTER remains 0%/R0 and observed remains Normal / Trace/R1.

- [x] **Step 4: Write failing UI tests for a percentage field and Slime Only toggle**

\`\`\`ts
await user.clear(screen.getByLabelText('BEFORE fouling coverage'));
await user.type(screen.getByLabelText('BEFORE fouling coverage'), '37');
await user.click(screen.getByLabelText('BEFORE Slime Only'));
expect(screen.getByLabelText('BEFORE fouling rating')).toHaveTextContent('R1');
expect(screen.getByLabelText('BEFORE fouling type')).toHaveTextContent('Micro fouling');
\`\`\`

- [x] **Step 5: Replace the coverage dropdown with a number field and visible toggle**

Clamp UI input to whole values 0–100, disable Slime Only for 0%, derive read-only type/rating, and retain accessible labels.

- [x] **Step 6: Run the focused test suite**

Run: \`pnpm vitest run src/domain/conditions.test.ts src/App.test.tsx\`

Expected: PASS.

- [x] **Step 7: Commit**

\`\`\`bash
git add src/domain/types.ts src/domain/conditions.ts src/domain/conditions.test.ts src/app/reportState.ts src/App.tsx src/App.test.tsx
git commit -m "feat: derive fouling from entered coverage"
\`\`\`

### Task 2: Build phase-first Word export data and placeholder mapping

**Files:**
- Create: \`src/docx/reportModel.ts\`
- Create: \`src/docx/reportModel.test.ts\`
- Modify: \`src/domain/pagination.ts\`
- Modify: \`src/domain/pagination.test.ts\`

**Interfaces:**
- Produces \`buildWordPhasePages(sections, photos): WordPhasePage[]\` where each page has section, phase, \`kind: 'first' | 'continuation'\`, and ordered photos.
- Produces \`templateValues(section, phase): TemplateValues\` with \`bc\`, \`sideLabel\`, \`title\`, \`work\`, \`fr\`, \`ft\`, \`fc\`, \`or\`, \`ol\`, and \`ot\`.
- Consumed only by DOCX generation; existing interactive pagination remains available for the preview.

- [x] **Step 1: Write failing mapping and phase-order tests**

\`\`\`ts
expect(templateValues(propellerSection, 'BEFORE')).toMatchObject({
  bc: 'NICHE AREAS & COMPONENTS / PROPELLER BLADE',
  title: 'PROPELLER BLADE 1 (Before)',
  work: 'Propeller Polishing',
  sideLabel: '', fr: '1', ft: 'Micro fouling', fc: '70%', or: '1', ol: 'Normal / Trace', ot: '-',
});
expect(buildWordPhasePages([section], elevenBeforePhotos).map((page) => page.photos.length)).toEqual([4, 6, 1]);
\`\`\`

- [x] **Step 2: Run the targeted test to verify it fails**

Run: \`pnpm vitest run src/docx/reportModel.test.ts\`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement labels, scope values, and page grouping**

Use Section order, then phase order BEFORE, AFTER, CURRENT constrained by \`section.phases\`. Sort Report Use photos by \`order\`. Make first page capacity 4, all later pages 6 within the phase. Map GENERAL to \`GENERAL AREAS / {ZONE}\`, PORT/STBD/BOTTOM labels as specified, and a side-less component to blank.

- [x] **Step 4: Add exhaustive grouping tests**

Test 0, 4, 5, 10, and 11 photos and a mixed BEFORE/AFTER section. Assert BEFORE groups precede AFTER and CURRENT is the only Inspection phase.

- [x] **Step 5: Run model and pagination tests**

Run: \`pnpm vitest run src/docx/reportModel.test.ts src/domain/pagination.test.ts\`

Expected: PASS.

- [x] **Step 6: Commit**

\`\`\`bash
git add src/docx/reportModel.ts src/docx/reportModel.test.ts src/domain/pagination.ts src/domain/pagination.test.ts
git commit -m "feat: model phase-first word pages"
\`\`\`

### Task 3: Add the bundled template and browser OOXML writer

**Files:**
- Create: \`public/templates/Detail_report_template.docx\`
- Create: \`src/docx/templateWriter.ts\`
- Create: \`src/docx/templateWriter.test.ts\`
- Modify: \`src/browser/images.ts\`
- Modify: \`package.json\`
- Modify: \`pnpm-lock.yaml\`

**Interfaces:**
- Produces \`writeTemplateReport(input: WordExportInput, deps?): Promise<WordExportResult>\`.
- \`WordExportInput\` accepts vessel name, sections, photos, \`templateUrl\`, and optional \`download(blob, fileName)\`.
- \`WordExportResult\` returns \`{ skipped: string[]; pageCount: number; blob: Blob }\`.

- [x] **Step 1: Add JSZip and copy the approved template asset**

Run: \`pnpm add jszip\`

Copy \`C:/coding/UWS_Report_Generator_v119_latest_build_ready/Detail_report_template.docx\` to \`public/templates/Detail_report_template.docx\`. Do not alter the source document.

- [x] **Step 2: Write failing writer tests with a minimal DOCX fixture**

\`\`\`ts
const result = await writeTemplateReport(input, { fetchTemplate, resize, download });
expect(result.pageCount).toBe(2);
expect(await readZipText(result.blob, 'word/header1.xml')).toBe(originalHeader);
expect(await readZipText(result.blob, 'word/footer1.xml')).toBe(originalFooter);
expect(await readZipText(result.blob, 'word/document.xml')).not.toContain('{{P1}}');
expect(await zip.file('word/media/image1.jpg')?.async('uint8array')).toEqual(new Uint8Array([1, 2, 3]));
\`\`\`

- [x] **Step 3: Run the writer test to verify it fails**

Run: \`pnpm vitest run src/docx/templateWriter.test.ts\`

Expected: FAIL because \`writeTemplateReport\` does not exist.

- [x] **Step 4: Implement placeholder replacement and image insertion**

Load the binary template through \`fetch\` and JSZip. Replace placeholder text in \`word/document.xml\` even when Word split it across adjacent \`<w:t>\` nodes. Replace each P marker paragraph with inline DrawingML, write \`word/media/imageN.jpg\`, add unique image relationships to \`word/_rels/document.xml.rels\`, and size images to the template’s two-column cells. Process one File at a time with a JPEG max edge of 1800 and quality 0.82.

- [x] **Step 5: Implement continuation body cloning**

Extract the continuation block containing P5–P10, clone it for each additional six-photo group, replace P5–P10 with the next ordered photos, and insert a Word page break before each clone. Keep only the original final \`<w:sectPr>\`; all cloned images use new media names and relationship IDs. Remove unused P markers.

- [x] **Step 6: Verify writer tests and OOXML content**

Run: \`pnpm vitest run src/docx/templateWriter.test.ts src/docx/reportModel.test.ts\`

Expected: PASS. Assert header/footer source XML is unchanged and no \`{{BC}}\`, \`{{TITLE}}\`, \`{{P1}}\`, or condition placeholder remains in \`word/document.xml\`.

- [x] **Step 7: Commit**

\`\`\`bash
git add public/templates/Detail_report_template.docx src/docx/templateWriter.ts src/docx/templateWriter.test.ts src/browser/images.ts package.json pnpm-lock.yaml
git commit -m "feat: generate reports from word template"
\`\`\`

### Task 4: Replace the final export UI with Word download

**Files:**
- Modify: \`src/App.tsx\`
- Modify: \`src/App.test.tsx\`
- Modify: \`src/styles.css\`
- Delete: \`src/pdf/exportReport.ts\`
- Delete: \`src/pdf/exportReport.test.ts\`

**Interfaces:**
- App dependency becomes \`exporter: (input: WordExportInput) => Promise<WordExportResult>\`.
- Final action provides one DOCX download, displays template name, phase-first page count, and skipped image names.

- [x] **Step 1: Write failing UI tests for the new final stage**

\`\`\`ts
expect(screen.getByRole('heading', { name: 'Word 보고서 다운로드' })).toBeVisible();
expect(screen.getByText('Detail Service Record 템플릿')).toBeVisible();
await user.click(screen.getByRole('button', { name: 'Word 보고서 다운로드' }));
expect(exporter).toHaveBeenCalledWith(expect.objectContaining({
  templateUrl: '/underwater-report-demo/templates/Detail_report_template.docx',
}));
\`\`\`

- [x] **Step 2: Run the app export test to verify it fails**

Run: \`pnpm vitest run src/App.test.tsx\`

Expected: FAIL because the UI still says PDF and calls the PDF exporter.

- [x] **Step 3: Wire lazy Word export and update all export copy**

Replace the PDF importer with a lazy \`templateWriter\` importer. Change stage rail, preview CTA, final heading, metadata, button copy, file extension, and status messages to Word. Display that final ordering is phase-first and calculate the Word page count. Do not add a server-upload control.

- [x] **Step 4: Retire the obsolete PDF exporter**

Remove the PDF module and tests after Word output is fully wired. Keep generic thumbnails and image resizing in \`src/browser/images.ts\`.

- [x] **Step 5: Run React and export tests**

Run: \`pnpm vitest run src/App.test.tsx src/docx/templateWriter.test.ts\`

Expected: PASS.

- [x] **Step 6: Commit**

\`\`\`bash
git add src/App.tsx src/App.test.tsx src/styles.css src/browser/images.ts src/pdf src/docx
git commit -m "feat: download word template report"
\`\`\`

### Task 5: Verify the workflow and publish

**Files:**
- Modify: \`e2e/report.spec.ts\` (or the existing Playwright report flow file)
- Modify: \`README.md\`

**Interfaces:**
- E2E flow builds a scope, enters 70% Slime Only BEFORE and 0% AFTER, supplies local fixture images, and confirms a Word download.

- [x] **Step 1: Write the failing browser test for DOCX download**

\`\`\`ts
const download = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Word 보고서 다운로드' }).click(),
]).then(([value]) => value);
expect(download.suggestedFilename()).toMatch(/\.docx$/);
\`\`\`

- [x] **Step 2: Run it and verify the expected initial failure**

Run: \`pnpm test:e2e -- --grep "Word report"\`

Expected: FAIL until Task 4 is complete, then PASS.

- [x] **Step 3: Add local-only/template-use guidance to README**

Document the bundled template, no photo upload, untouched header/footer, and Before→After or Current output order.

- [x] **Step 4: Run the complete quality suite**

Run: \`pnpm test:run && pnpm lint && pnpm build && pnpm build:portable && pnpm test:e2e\`

Expected: every command exits 0.

- [x] **Step 5: Verify a representative DOCX package**

Run the export fixture, open its ZIP package, verify header/footer XML equals the template originals, verify media and image relationships exist, and verify no named placeholder remains. Render to PDF and inspect the first and continuation page only if a compatible local Word/LibreOffice renderer is available; otherwise record structural verification.

- [x] **Step 6: Commit and publish**

\`\`\`bash
git add e2e README.md
git commit -m "test: verify word report download"
git push
\`\`\`

