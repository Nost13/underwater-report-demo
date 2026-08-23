import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';
import { request as rawRequest } from 'node:http';

async function buildGeneralScope(page: import('@playwright/test').Page) {
  await page.goto('/');
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
  await page.goto('/');
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
  await page.getByRole('button', { name: 'Niche 추가' }).click();
  await expect(page.getByLabel('PROPELLER BLADE UNIT 05 배정 상태')).toContainText('POLISHING');
  await expect(page.getByLabel('FIN BLADE UNIT 05 배정 상태')).toContainText('POLISHING');
  await page.screenshot({ path: 'e2e/polishing-propeller-fin-1440.png', fullPage: true });
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
  await page.getByRole('button', { name: '표준 폴더 구조 생성' }).click();
  await expect(page.locator('.status-line')).toContainText('15개 Section의 폴더');
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

test('the unified photo input imports UNMATCHED, assigns, unassigns, and reassigns', async ({ page }) => {
  await buildGeneralScope(page);
  const directoryInput = page.locator('input[type="file"]');
  await expect(directoryInput).toHaveAttribute('webkitdirectory', '');
  await directoryInput.setInputFiles('e2e/fixtures');
  await expect(page.locator('.status-line')).toContainText('UNMATCHED');
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
  await page.getByRole('button', { name: '배정' }).click();
  await expect(page.getByRole('button', { name: 'UNMATCHED 0' })).toBeDisabled();
  await expect(page.locator('.page-badge b')).toHaveText('1P');

  await page.getByRole('button', { name: 'manual.jpg 재배정' }).click();
  await page.getByRole('button', { name: 'UNMATCHED 1' }).click();
  await page.getByLabel('manual.jpg section').selectOption('CLEANING/GENERAL/FWD/STBD');
  await page.getByLabel('manual.jpg phase').selectOption('AFTER');
  await page.getByRole('button', { name: '배정' }).click();
  await expect(page.locator('.page-badge b')).toHaveText('0P');
  await page.getByLabel('Report section').selectOption('CLEANING/GENERAL/FWD/STBD');
  await expect(page.locator('.page-badge b')).toHaveText('1P');
  await expect(page.locator('.phase-panel.after')).toContainText('manual.jpg');
});

test('one physical target can carry two services with unambiguous folders', async ({ page }) => {
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

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByRole('button', { name: '전체 적용' }).click();
  await page.getByRole('button', { name: 'Polishing 작업 선택' }).click();
  await page.getByRole('button', { name: 'FWD PORT 작업 추가' }).click();
  await page.screenshot({ path: 'e2e/scope-mixed-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Scope 만들기' }).click();
  await expect(page.locator('.scope-ready')).toContainText('총 16 sections');
  await expect(page.locator('.scope-summary')).toContainText('CLEANING 15');
  await expect(page.locator('.scope-summary')).toContainText('POLISHING 1');

  await page.getByRole('button', { name: '사진 폴더 선택' }).click();
  await page.getByRole('button', { name: '표준 폴더 구조 생성' }).click();
  const paths = await page.evaluate(() => (window as unknown as Window & { __createdPaths: string[] }).__createdPaths);
  expect(paths).toEqual(expect.arrayContaining([
    'CLEANING/GENERAL/FWD/PORT/BEFORE',
    'CLEANING/GENERAL/FWD/PORT/AFTER',
    'POLISHING/GENERAL/FWD/PORT/BEFORE',
    'POLISHING/GENERAL/FWD/PORT/AFTER',
    'GENERAL/FWD/STBD/BEFORE',
  ]));
  expect(paths.filter((path) => /\/(BEFORE|AFTER)$/.test(path))).toHaveLength(32);
});

test('an Inspection exception uses CURRENT while other Sections keep BEFORE and AFTER', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByRole('button', { name: '전체 적용' }).click();
  await page.getByRole('button', { name: 'Inspection 작업 선택' }).click();
  await page.getByRole('button', { name: 'AFT STBD 작업 배정', exact: true }).click();
  await page.getByRole('button', { name: 'Scope 만들기' }).click();
  await page.getByRole('button', { name: 'Report Input으로' }).click();

  await expect(page.locator('.phase-panel.before')).toBeVisible();
  await expect(page.locator('.phase-panel.after')).toBeVisible();
  await page.getByLabel('Report section').selectOption('INSPECTION/GENERAL/AFT/STBD');
  await expect(page.locator('.phase-panel.current')).toBeVisible();
  await expect(page.locator('.phase-panel.before')).toHaveCount(0);
  await expect(page.locator('.phase-panel.after')).toHaveCount(0);
});

test('complete 1440px flow covers five-page virtualization, QA focus, shrink, and PDF', async ({ page }) => {
  test.setTimeout(90_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await buildGeneralScope(page);
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: '샘플 사진 7장 불러오기' }).click();
    await expect(page.locator('.status-line')).toContainText('샘플 사진 7장', { timeout: 20_000 });
    await page.waitForTimeout(10);
  }

  await page.getByRole('button', { name: 'Report Input으로' }).click();
  await page.getByLabel('BEFORE condition').selectOption('BIOFOULING');
  await page.getByLabel('BEFORE rating').selectOption('R2');
  await page.getByLabel('AFTER rating').selectOption('R1');
  await expect(page.getByLabel('AFTER condition')).toHaveValue('CLEAN');
  await expect(page.getByLabel('AFTER rating')).toHaveValue('R1');
  await expect(page.locator('.page-badge b')).toHaveText('5P');
  const beforeBox = await page.locator('.phase-panel.before').boundingBox();
  const afterBox = await page.locator('.phase-panel.after').boundingBox();
  const thumbBox = await page.locator('.phase-panel.before .thumb').first().boundingBox();
  expect(beforeBox).not.toBeNull();
  expect(afterBox).not.toBeNull();
  expect(thumbBox?.width).toBeGreaterThan(220);
  expect(afterBox!.y).toBeGreaterThan(beforeBox!.y + beforeBox!.height);
  await page.screenshot({ path: 'e2e/report-input-1440.png', fullPage: true });

  await page.getByRole('button', { name: 'Check / Preview' }).last().click();
  await expect(page.locator('.pager b')).toHaveText('1 / 5');
  await expect(page.locator('.report-page')).toHaveCount(2);
  await page.locator('.pager button').last().click();
  await page.locator('.pager button').last().click();
  await expect(page.locator('.pager b')).toHaveText('3 / 5');
  await expect(page.locator('.report-page')).toHaveCount(3);
  await page.screenshot({ path: 'e2e/preview-1440.png', fullPage: true });

  const issue = page.locator('.qa-list button').filter({ hasText: 'GENERAL/FWD/STBD' }).first();
  await expect(issue).toBeVisible();
  await issue.click();
  await expect(page.locator('.input-heading')).toContainText('GENERAL/FWD/STBD');
  await page.getByLabel('Report section').selectOption('CLEANING/GENERAL/FWD/PORT');
  await expect(page.locator('.page-badge b')).toHaveText('5P');

  const reportUseSwitches = page.locator('.switch');
  for (let index = 0; index < 24; index += 1) {
    await reportUseSwitches.nth(index).click();
  }
  await expect(page.locator('.page-badge b')).toHaveText('1P');

  await page.getByRole('button', { name: 'Check / Preview' }).last().click();
  await expect(page.locator('.pager b')).toHaveText('1 / 1');
  await expect(page.locator('.report-page')).toHaveCount(1);
  await page.getByRole('button', { name: 'PDF 준비' }).click();
  const exportButton = page.getByRole('button', { name: 'PDF 다운로드' });
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  await expect(page.getByRole('button', { name: 'PDF 생성 중…' })).toBeDisabled();
  const download = await downloadPromise;
  await download.saveAs('e2e/generated-report.pdf');
  expect((await stat('e2e/generated-report.pdf')).size).toBeGreaterThan(10_000);
  await expect(page.getByText('PDF 다운로드가 완료되었습니다.')).toBeVisible();
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
