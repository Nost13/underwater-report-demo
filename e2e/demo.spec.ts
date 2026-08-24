import { expect, test } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import { request as rawRequest } from 'node:http';
import JSZip from 'jszip';

async function buildGeneralScope(page: import('@playwright/test').Page) {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-nextjs-dialog], .vite-error-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await expect(page.getByText('M.V. PACIFIC AURORA').first()).toBeVisible();
  await page.getByRole('button', { name: '전체 적용' }).click();
  await page.getByRole('button', { name: 'Scope 만들기' }).click();
  await expect(page.locator('.scope-ready')).toContainText('총 15 sections');
  await expect(page.locator('.scope-summary')).toContainText('CLEANING 15');
  await expect(page.getByRole('button', { name: 'Cleaning 작업 선택' })).toBeDisabled();
}

test('Polishing prepares Propeller and can add matching Fin Blades at 1440px', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByLabel('Niche component').selectOption('Boss Cap');
  await page.getByRole('button', { name: 'Polishing 작업 선택' }).click();
  await expect(page.getByLabel('Niche component')).toHaveValue('Propeller Blade');
  await expect(page.getByLabel('Quantity')).toHaveValue('4');
  await expect(page.getByRole('button', { name: '수량 감소' })).toBeVisible();
  await expect(page.getByRole('button', { name: '수량 증가' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Fin Blade 포함' }).check();
  await page.getByRole('button', { name: '수량 증가' }).click();
  await expect(page.getByLabel('Quantity')).toHaveValue('5');
  await expect(page.getByText('자동 세트: Propeller Polishing + Boss Cap Polishing + Rope Guard Inspection')).toBeVisible();
  await page.getByRole('button', { name: 'Niche 추가' }).click();
  await expect(page.getByLabel('PROPELLER BLADE UNIT 05 배정 상태')).toContainText('POLISHING');
  await expect(page.getByLabel('FIN BLADE UNIT 05 배정 상태')).toContainText('POLISHING');
  await expect(page.getByLabel('BOSS CAP 배정 상태')).toContainText('POLISHING');
  await expect(page.getByLabel('ROPE GUARD 배정 상태')).toContainText('INSPECTION');
  await page.screenshot({ path: 'e2e/polishing-propeller-fin-1440.png', fullPage: true });
});

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
  await expect(page.getByLabel('BEFORE fouling coverage', { exact: true })).toHaveValue('15');
  await page.getByLabel('BEFORE fouling coverage', { exact: true }).fill('40');

  await page.getByRole('button', {
    name: 'POLISHING/NICHE/PROPELLER BLADE/01 Section 열기',
  }).click();
  await page.getByLabel('구역 기본 BEFORE fouling coverage').fill('20');
  await page.getByRole('button', { name: 'BEFORE 기본값 적용' }).click();
  await page.getByRole('button', {
    name: 'POLISHING/NICHE/PROPELLER BLADE/02 Section 열기',
  }).click();
  await expect(page.getByLabel('BEFORE fouling coverage', { exact: true })).toHaveValue('40');
  await page.getByRole('button', { name: 'BEFORE 기본값으로 되돌리기' }).click();
  await expect(page.getByLabel('BEFORE fouling coverage', { exact: true })).toHaveValue('20');
});

test('the unified photo input creates the exact GENERAL directory tree', async ({ page }) => {
  await page.addInitScript(() => {
    const created: string[] = [];
    class MemoryDirectory {
      kind = 'directory' as const;
      children = new Map<string, MemoryDirectory>();
      constructor(public name = '', public path = '') {}
      async getDirectoryHandle(name: string) {
        let child = this.children.get(name);
        if (!child) {
          const path = this.path ? `${this.path}/${name}` : name;
          child = new MemoryDirectory(name, path);
          this.children.set(name, child);
          created.push(path);
        }
        return child;
      }
      async *entries(): AsyncGenerator<[string, MemoryDirectory]> {
        yield* this.children.entries();
      }
    }
    const demoWindow = window as unknown as Window & {
      __createdPaths: string[];
      showDirectoryPicker: () => Promise<MemoryDirectory>;
    };
    demoWindow.__createdPaths = created;
    const root = new MemoryDirectory('사진');
    demoWindow.showDirectoryPicker = async () => root;
  });

  await buildGeneralScope(page);
  await page.getByRole('button', { name: '사진 폴더 선택' }).click();
  await expect(page.getByLabel('사진 입력 진행 상태')).toContainText('폴더 선택 완료 · 사진');
  await expect(page.getByLabel('사진 입력 진행 상태')).toContainText('폴더 구조를 아직 생성하지 않음');
  await page.getByRole('button', { name: '표준 폴더 구조 생성' }).click();
  await expect(page.getByLabel('사진 입력 진행 상태'))
    .toContainText('구조 생성 완료 · 15 Sections / 30 Phase folders');
  const paths = await page.evaluate(() => (
    window as unknown as Window & { __createdPaths: string[] }
  ).__createdPaths);
  expect(paths).toEqual(expect.arrayContaining([
    'GENERAL/FWD/PORT/BEFORE',
    'GENERAL/FWD/PORT/AFTER',
    'GENERAL/AFT/BOTTOM/AFTER',
  ]));
  expect(paths.filter((path) => /\/(BEFORE|AFTER)$/.test(path))).toHaveLength(30);
});

test('12px application typography keeps photo controls readable without overflow', async ({ page }) => {
  await buildGeneralScope(page);
  await page.getByRole('button', { name: '샘플 사진 7장 불러오기' }).click();
  await page.getByRole('button', { name: 'Report Input으로' }).click();

  expect(await page.locator('body').evaluate((node) => getComputedStyle(node).fontSize)).toBe('12px');
  expect(await page.locator('.phase-select').first().evaluate((node) => getComputedStyle(node).fontSize)).toBe('12px');
  expect(await page.locator('.photo-action-button').first().evaluate((node) => getComputedStyle(node).fontSize)).toBe('12px');
  expect((await page.locator('.photo-action-button').first().boundingBox())?.height).toBeGreaterThanOrEqual(34);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.getByRole('button', { name: 'Check / Preview' }).last().click();
  expect(await page.locator('.report-page').first().evaluate((node) => getComputedStyle(node).fontSize)).toBe('14px');
});

test('the unified photo input assigns UNMATCHED photos to the clicked phase, moves them, and adds directly', async ({ page }) => {
  await buildGeneralScope(page);
  const directoryInput = page.locator('input[type="file"][webkitdirectory]');
  await expect(directoryInput).toHaveAttribute('webkitdirectory', '');
  await directoryInput.setInputFiles('e2e/fixtures');
  await expect(page.getByLabel('사진 입력 진행 상태')).toContainText('UNMATCHED');
  await page.getByRole('button', { name: 'Report Input으로' }).click();
  await page.getByRole('button', { name: 'UNMATCHED 1' }).click();
  await expect(page.getByLabel('UNMATCHED 사진 배정')).toBeVisible();
  await expect(page.locator('.report-workspace')).toHaveClass(/unmatched-open/);
  const beforePanel = page.locator('.phase-panel.before');
  const beforeWidthWithDrawer = (await beforePanel.boundingBox())?.width ?? 0;
  const drawerThumb = await page.locator('.unmatched-thumb').boundingBox();
  expect(drawerThumb).not.toBeNull();
  expect((drawerThumb?.width ?? 0) / (drawerThumb?.height ?? 1)).toBeCloseTo(1.6, 1);
  await page.getByRole('button', { name: 'UNMATCHED 닫기' }).click();
  await expect(page.locator('.report-workspace')).not.toHaveClass(/unmatched-open/);
  const beforeWidthWithoutDrawer = (await beforePanel.boundingBox())?.width ?? 0;
  expect(beforeWidthWithoutDrawer).toBeGreaterThan(beforeWidthWithDrawer);
  await page.getByRole('button', { name: 'UNMATCHED 1' }).click();
  await page.getByRole('button', { name: 'AFTER 이곳에 사진 배정' }).click();
  await expect(page.locator('.assignment-target')).toContainText('AFTER');
  await page.getByRole('button', { name: 'manual.jpg 사진 배정' }).click();
  await expect(page.getByRole('button', { name: 'UNMATCHED 0' })).toBeDisabled();
  await expect(page.locator('.page-badge b')).toHaveText('1P');
  await expect(page.locator('.phase-panel.after')).toContainText('manual.jpg');

  await page.getByRole('button', { name: 'manual.jpg 이동' }).click();
  await page.getByLabel('manual.jpg 이동 Section').selectOption('CLEANING/GENERAL/FWD/STBD');
  await page.getByLabel('manual.jpg 이동 Phase').selectOption('AFTER');
  await page.getByRole('button', { name: '이동 완료' }).click();
  await expect(page.locator('.page-badge b')).toHaveText('0P');
  await page.getByRole('button', { name: 'CLEANING/GENERAL/FWD/STBD Section 열기' }).click();
  await expect(page.locator('.page-badge b')).toHaveText('1P');
  await expect(page.locator('.phase-panel.after')).toContainText('manual.jpg');
  await page.getByRole('button', { name: 'manual.jpg 삭제' }).click();
  await expect(page.locator('.phase-panel.after')).not.toContainText('manual.jpg');
  await page.getByRole('button', { name: 'AFTER에 사진 추가' }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles('e2e/fixtures/manual.jpg');
  await expect(page.locator('.phase-panel.after')).toContainText('manual.jpg');
});

test('one physical target can carry Cleaning and Inspection with unambiguous folders', async ({ page }) => {
  await page.addInitScript(() => {
    const created: string[] = [];
    class MemoryDirectory {
      kind = 'directory' as const;
      children = new Map<string, MemoryDirectory>();
      constructor(public name = '', public path = '') {}
      async getDirectoryHandle(name: string) {
        let child = this.children.get(name);
        if (!child) {
          const path = this.path ? `${this.path}/${name}` : name;
          child = new MemoryDirectory(name, path);
          this.children.set(name, child);
          created.push(path);
        }
        return child;
      }
      async *entries(): AsyncGenerator<[string, MemoryDirectory]> { yield* this.children.entries(); }
    }
    const demoWindow = window as unknown as Window & { __createdPaths: string[]; showDirectoryPicker: () => Promise<MemoryDirectory> };
    demoWindow.__createdPaths = created;
    demoWindow.showDirectoryPicker = async () => new MemoryDirectory('사진');
  });

  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByRole('button', { name: '전체 적용' }).click();
  await page.getByRole('button', { name: 'Inspection 작업 선택' }).click();
  await page.getByRole('button', { name: 'FWD PORT 작업 배정' }).click();
  await page.screenshot({ path: 'e2e/scope-mixed-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Scope 만들기' }).click();
  await expect(page.locator('.scope-ready')).toContainText('총 16 sections');
  await expect(page.locator('.scope-summary')).toContainText('CLEANING 15');
  await expect(page.locator('.scope-summary')).toContainText('INSPECTION 1');

  await page.getByRole('button', { name: '사진 폴더 선택' }).click();
  await page.getByRole('button', { name: '표준 폴더 구조 생성' }).click();
  const paths = await page.evaluate(() => (window as unknown as Window & { __createdPaths: string[] }).__createdPaths);
  expect(paths).toEqual(expect.arrayContaining([
    'GENERAL/FWD/PORT/BEFORE',
    'GENERAL/FWD/PORT/AFTER',
    'GENERAL/FWD/PORT/CURRENT',
    'GENERAL/FWD/STBD/BEFORE',
  ]));
  expect(paths.filter((path) => /\/(CURRENT|BEFORE|AFTER)$/.test(path))).toHaveLength(31);
});

test('an Inspection exception uses CURRENT while other Sections keep BEFORE and AFTER', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByRole('button', { name: '전체 적용' }).click();
  await page.getByRole('button', { name: 'Inspection 작업 선택' }).click();
  await page.getByRole('button', { name: 'AFT STBD 작업 배정', exact: true }).click();
  await page.getByRole('button', { name: 'Scope 만들기' }).click();
  await page.getByRole('button', { name: 'Report Input으로' }).click();

  await expect(page.locator('.phase-panel.before')).toBeVisible();
  await expect(page.locator('.phase-panel.after')).toBeVisible();
  await page.getByRole('button', { name: '전체 Section 목록 열기' }).click();
  const picker = page.getByRole('dialog', { name: '전체 Section' });
  await picker.getByRole('searchbox', { name: 'Section 검색' }).fill('INSPECTION AFT STBD');
  await picker.getByRole('button', { name: 'INSPECTION AFT · STBD Section 열기' }).click();
  await expect(page.locator('.phase-panel.current')).toBeVisible();
  await expect(page.locator('.phase-panel.before')).toHaveCount(0);
  await expect(page.locator('.phase-panel.after')).toHaveCount(0);
});

test('complete 1440px flow covers preview, QA focus, repagination, and Word download', async ({ page }) => {
  test.setTimeout(90_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      browserErrors.push(`${message.text()} @ ${location.url}:${location.lineNumber}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) browserErrors.push(`${response.status()} ${response.url()}`);
  });

  await buildGeneralScope(page);
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: '샘플 사진 7장 불러오기' }).click();
    await expect(page.getByLabel('사진 입력 상세 상태')).toContainText('샘플 사진 7장', { timeout: 20_000 });
    await page.waitForTimeout(10);
  }

  await page.getByRole('button', { name: 'Report Input으로' }).click();
  await expect(page.locator('.section-tab')).toHaveCount(5);
  await page.getByRole('button', { name: '전체 Section 목록 열기' }).click();
  const sectionPicker = page.getByRole('dialog', { name: '전체 Section' });
  await sectionPicker.getByRole('searchbox', { name: 'Section 검색' }).fill('AFT BOTTOM');
  await expect(sectionPicker.getByRole('button', { name: 'CLEANING AFT · BOTTOM Section 열기' })).toBeVisible();
  await sectionPicker.getByRole('button', { name: '전체 Section 닫기' }).click();
  await page.getByLabel('BEFORE fouling coverage', { exact: true }).fill('4');
  await expect(page.getByLabel('BEFORE fouling type', { exact: true })).toHaveText('Light Macro fouling');
  await expect(page.getByLabel('BEFORE fouling rating', { exact: true })).toHaveText('R2');
  await page.getByLabel('AFTER fouling coverage', { exact: true }).fill('37');
  await page.getByLabel('AFTER Slime Only', { exact: true }).check();
  await expect(page.getByLabel('AFTER fouling type', { exact: true })).toHaveText('Micro fouling');
  await expect(page.getByLabel('AFTER fouling rating', { exact: true })).toHaveText('R1');
  await expect(page.locator('.page-badge b')).toHaveText('6P');
  const beforeBox = await page.locator('.phase-panel.before').boundingBox();
  const afterBox = await page.locator('.phase-panel.after').boundingBox();
  const thumbBox = await page.locator('.phase-panel.before .thumb').first().boundingBox();
  const desktopGridColumns = await page.locator('.phase-panel.before .photo-list').evaluate((node) => (
    getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length
  ));
  expect(beforeBox).not.toBeNull();
  expect(afterBox).not.toBeNull();
  expect(thumbBox?.width).toBeGreaterThan(190);
  expect(desktopGridColumns).toBe(5);
  expect(afterBox!.y).toBeGreaterThan(beforeBox!.y + beforeBox!.height);
  await page.screenshot({ path: 'e2e/report-input-1440.png', fullPage: true });

  await page.getByRole('button', { name: 'Check / Preview' }).last().click();
  await expect(page.getByLabel('전체 Report Preview')).toBeVisible();
  await expect(page.locator('.report-page')).toHaveCount(6);
  await expect(page.locator('.qa-list')).toHaveCount(0);
  await page.getByRole('button', { name: /Report Check.*issues/ }).click();
  await page.screenshot({ path: 'e2e/preview-1440.png', fullPage: true });

  const issue = page.locator('.qa-list button').filter({ hasText: 'GENERAL/FWD/STBD' }).first();
  await expect(issue).toBeVisible();
  await issue.click();
  await expect(page.locator('.input-heading')).toContainText('GENERAL/FWD/STBD');
  await page.getByRole('button', { name: 'CLEANING/GENERAL/FWD/PORT Section 열기' }).click();
  await expect(page.locator('.page-badge b')).toHaveText('6P');

  const reportUseSwitches = page.locator('.switch');
  const firstReportUse = page.locator('.switch-input').first();
  await firstReportUse.focus();
  await page.keyboard.press('Space');
  await expect(firstReportUse).not.toBeChecked();
  for (let index = 1; index < 25; index += 1) {
    await reportUseSwitches.nth(index).click();
  }
  await expect(page.locator('.page-badge b')).toHaveText('1P');

  await page.getByRole('button', { name: 'Check / Preview' }).last().click();
  await expect(page.getByLabel('전체 Report Preview')).toBeVisible();
  await expect(page.locator('.report-page')).toHaveCount(1);
  await page.getByRole('button', { name: 'Word 준비' }).click();
  await expect(page.locator('.export-doc')).toContainText('Detail Service Record 템플릿');
  const exportButton = page.getByRole('button', { name: 'Word 보고서 다운로드' });
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const outputPath = 'e2e/generated-report.docx';
  await download.saveAs(outputPath);
  expect(download.suggestedFilename()).toMatch(/UNDERWATER_SERVICE_REPORT\.docx$/);
  expect((await stat(outputPath)).size).toBeGreaterThan(500_000);
  const outputZip = await JSZip.loadAsync(await readFile(outputPath));
  const documentXml = await outputZip.file('word/document.xml')?.async('text') ?? '';
  expect(documentXml).toContain('GENERAL AREAS / FWD');
  expect(documentXml).toContain('N/A');
  expect(documentXml).not.toMatch(/\{\{(?:P\d+|BC|TITLE|WORK|FT|FC|OL|OT|SIDE_LABEL)\}\}|@(?:FR|OR)/);
  await expect(page.getByText('Word 보고서 다운로드가 완료되었습니다.')).toBeVisible();
  await page.screenshot({ path: 'e2e/final-1440.png', fullPage: true });

  expect(browserErrors).toEqual([]);
});

test('packaged server rejects malformed and traversal paths without stopping', async ({ request }, testInfo) => {
  test.skip(!String(testInfo.project.use.baseURL).includes('4173'), 'Packaged server check');
  const rawStatus = (path: string) => new Promise<number>((resolve, reject) => {
    const outgoing = rawRequest({ host: '127.0.0.1', port: 4173, path }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
  expect(await rawStatus('/%E0%A4%A')).toBe(400);
  expect(await rawStatus('/..%5Cpackage.json')).toBe(403);
  expect((await request.get('/')).status()).toBe(200);
});
