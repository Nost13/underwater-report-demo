# Section 1–4 Template Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate the supplied Section 1–4 Word template from editable vessel and operational information, then place it before the existing detailed service record output.

**Architecture:** Add an explicit report-information model populated by the IMO lookup and editable in the first workflow screen. Use a browser OOXML writer that maps those values to the known Section 1–4 table cells, preserving the template package's styles, header, and footer. Assemble its completed body before the existing detailed record bodies while retaining the source template's report-wide page furniture.

**Tech Stack:** React 19, TypeScript, Vitest, JSZip, browser File APIs, OOXML/DOCX.

**Spec:** `docs/superpowers/specs/2026-08-25-section1-4-template-export-design.md`

## Global Constraints

- All information and files stay in the browser; do not add a report, photo, or vessel server.
- Use `public/templates/section1_4_template.docx` as the unmodified Section 1–4 source asset.
- Retain the document's existing typography, header, footer, and A4 layout.
- Fall back to an editable local record when an IMO is not present in the demo Vessel DB.

---

### Task 1: Model report information and IMO lookup data

**Files:**
- Create: `src/app/reportInfo.ts`
- Create: `src/app/reportInfo.test.ts`
- Modify: `src/app/demoData.ts`
- Modify: `src/app/demoData.test.ts`

**Interfaces:**
- Produces `ReportInfo` with `vessel`, `operation`, `serviceItems`, and `readiness` fields.
- Produces `reportInfoFromVessel(vessel: Vessel | null): ReportInfo`.
- Produces `reportInfoForScopes(info: ReportInfo, services: ServiceKind[]): ReportInfo`.

- [ ] **Step 1: Write failing model tests**

```ts
expect(reportInfoFromVessel(DEMO_VESSELS[0]).vessel).toMatchObject({
  name: 'M.V. PACIFIC AURORA',
  imo: '9876543',
});
expect(reportInfoForScopes(emptyReportInfo(), ['INSPECTION', 'POLISHING']).serviceItems)
  .toEqual(['Inspection', 'Polishing']);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm vitest run src/app/reportInfo.test.ts`

Expected: FAIL because `reportInfo.ts` does not exist.

- [ ] **Step 3: Implement the smallest typed report-information model**

```ts
export interface ReportInfo {
  vessel: { name: string; imo: string; callSign: string; type: string; loa: string; breadth: string; gt: string; dwt: string; yearBuilt: string; ownerClient: string; jobNo: string };
  operation: { eta: string; etd: string; workWindow: string; location: string; start: string; end: string; workingTime: string; position: string; draughtFwd: string; draughtMid: string; draughtAft: string; berthingSide: string; weather: string; knots: string; current: string; visibility: string; personnel: string };
  serviceItems: string[];
  readiness: { toolboxTime: string; toolboxNote: string; preparationTime: string; preparationNote: string };
}
```

Extend each local Vessel record only with known prefill values. Empty values are valid and are user-editable.

- [ ] **Step 4: Re-run model tests**

Run: `pnpm vitest run src/app/reportInfo.test.ts src/app/demoData.test.ts`

Expected: PASS.

### Task 2: Make Section 1–4 information editable in the app

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- App owns `reportInfo: ReportInfo`.
- IMO confirmation applies `reportInfoFromVessel` but does not overwrite fields after the user edits them.
- Service-scope creation refreshes `serviceItems` from the selected services.

- [ ] **Step 1: Write a failing screen test**

```tsx
expect(screen.getByRole('heading', { name: '보고서 기본 정보' })).toBeVisible();
await user.type(screen.getByLabelText('Job No'), 'US-TEST-001');
expect(screen.getByLabelText('Job No')).toHaveValue('US-TEST-001');
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm vitest run src/App.test.tsx`

Expected: FAIL because the report-information form is absent.

- [ ] **Step 3: Add compact, grouped inputs under Vessel / Scope**

Show vessel facts, operation, service rows, and readiness fields in collapsible groups. Keep the PC 1440px composition and use the existing application controls/styles; no extra workflow stage is introduced.

- [ ] **Step 4: Re-run screen tests**

Run: `pnpm vitest run src/App.test.tsx`

Expected: PASS.

### Task 3: Fill the Section 1–4 DOCX template

**Files:**
- Create: `public/templates/section1_4_template.docx`
- Create: `src/docx/section14Writer.ts`
- Create: `src/docx/section14Writer.test.ts`

**Interfaces:**
- Produces `fillSection14Template(input, deps?): Promise<Blob>`.
- Input is `{ reportInfo: ReportInfo; templateUrl: string }`.
- The writer updates Section 1–4 table cells and the Job No/Vessel header text without changing the footer.

- [ ] **Step 1: Copy the approved template to the application asset path**

Copy `C:\업무4\보고서5\UWS_Report_Generator_v118_summary_sample_page_reference_fix1\section1_4_template.docx` to `public/templates/section1_4_template.docx` unchanged.

- [ ] **Step 2: Write failing OOXML writer tests**

```ts
const blob = await fillSection14Template({ reportInfo, templateUrl: 'template.docx' }, { fetchTemplate });
expect(await textAtCell(blob, 0, 1, 1)).toBe('M.V. TEST');
expect(await headerText(blob)).toContain('US-TEST-001');
expect(await footerXml(blob)).toBe(originalFooter);
```

- [ ] **Step 3: Run the writer test and confirm it fails**

Run: `pnpm vitest run src/docx/section14Writer.test.ts`

Expected: FAIL because `fillSection14Template` does not exist.

- [ ] **Step 4: Implement fixed-cell OOXML updates**

Parse `word/document.xml`, locate the Section 1–4 tables by their immutable labels, and replace only the value cells. Replace text across split `w:t` nodes, preserve the first run's existing formatting, and clear surplus text nodes. Map selected service scopes to the Service Items rows in their original order.

- [ ] **Step 5: Re-run writer tests**

Run: `pnpm vitest run src/docx/section14Writer.test.ts`

Expected: PASS, with all example sample values replaced where values were supplied and header/footer XML retained.

### Task 4: Assemble the overall Word report

**Files:**
- Modify: `src/docx/templateWriter.ts`
- Modify: `src/docx/templateWriter.test.ts`
- Modify: `src/docx/templateWriter.integration.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- `WordExportInput` gains `reportInfo: ReportInfo` and `section14TemplateUrl: string`.
- `writeTemplateReport` outputs Section 1–4 first, then phase-first detailed pages.

- [ ] **Step 1: Write a failing overall-document test**

```ts
const result = await writeTemplateReport({ ...input, reportInfo, section14TemplateUrl: 'section1_4.docx' }, deps);
expect(await documentText(result.blob)).toContain('1. GENERAL INFORMATION');
expect(await documentText(result.blob)).toContain('7. DETAILED SERVICE RECORD');
expect(await documentText(result.blob)).toContain('M.V. TEST');
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm vitest run src/docx/templateWriter.integration.test.ts`

Expected: FAIL because the generated report only has detailed records.

- [ ] **Step 3: Implement document assembly without duplicate section properties**

Fill the Section 1–4 package first, copy its completed body before the first detailed page, preserve only one final `w:sectPr`, and import any required package relationships/media with unique names. Retain the Section 1–4 header/footer on those first pages and the existing detailed-record header/footer afterward.

- [ ] **Step 4: Re-run Word integration and app export tests**

Run: `pnpm vitest run src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts src/App.test.tsx`

Expected: PASS.

### Task 5: Verify and publish

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full project checks**

Run: `pnpm test:run && pnpm lint && pnpm build && pnpm build:portable`

Expected: every command exits 0.

- [ ] **Step 2: Inspect a generated DOCX structurally**

Verify the completed package includes populated Section 1–4 values, complete detailed pages, media relationships, and unchanged footer XML. Render to page images if a compatible local renderer is available.

- [ ] **Step 3: Commit and publish the verified build**

```bash
git add src public README.md docs
git commit -m "feat: add section 1-4 word template export"
git push origin main
```

