import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { request as rawRequest } from 'node:http';
import JSZip from 'jszip';

import type { Page } from '@playwright/test';

const vesselFixture = {
  vesselName: 'M.V. PACIFIC AURORA',
  vesselType: 'Bulk Carrier',
  imoNo: '9876543',
  callsign: '3EAB7',
  loa: '229.0',
  breadth: '32.3',
  gt: '43,000',
  dwt: '82,000',
  built: '2018',
  ownerClient: 'Demo Client',
};

test.beforeEach(async ({ page }) => {
  await page.route('https://marine-ops-dashboard.vercel.app/api/vessels**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ matches: [vesselFixture] }),
    });
  });
});

async function completeVesselDiagram(page: Page, filePath = 'e2e/fixtures/vessel-side.png') {
  await page.getByRole('button', { name: 'Report Information 입력' }).click();
  await page.getByRole('button', { name: '선박 위치도 설정으로' }).click();
  await page.getByLabel('선박 사이드뷰 이미지').setInputFiles(filePath);
  await page.getByRole('button', { name: 'Niche 맞추기로 이동' }).click();
  await page.getByRole('button', { name: '선박 위치도 설정 완료' }).click();
  await expect(page.getByRole('heading', { name: '사진 폴더' })).toBeVisible();
}

async function buildGeneralScope(page: Page) {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-nextjs-dialog], .vite-error-overlay')).toHaveCount(0);
  await page.getByLabel('Vessel name / IMO number / Call Sign').fill('9876543');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await expect(page.getByText('M.V. PACIFIC AURORA').first()).toBeVisible();
  await page.getByRole('button', { name: '전체 적용' }).click();
  await page.getByRole('button', { name: /Scope 만들기$/ }).click();
  await expect(page.locator('.scope-ready')).toContainText('총 15 sections');
  await expect(page.locator('.scope-summary')).toContainText('CLEANING 15');
  await expect(page.getByRole('button', { name: 'Cleaning 작업 선택' })).toBeDisabled();
  await completeVesselDiagram(page);
}

test('Polishing prepares Propeller and can add matching Fin Blades at 1440px', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Vessel name / IMO number / Call Sign').fill('9876543');
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
  await expect(page.getByLabel('자동 추가 작업')).toBeVisible();
  await page.getByRole('button', { name: /Scope 추가$/ }).click();
  await expect(page.getByLabel('PROPELLER BLADE UNIT 05 배정 상태')).toContainText('POLISHING');
  await expect(page.getByLabel('FIN BLADE UNIT 05 배정 상태')).toContainText('POLISHING');
  await expect(page.getByLabel('BOSS CAP 배정 상태')).toContainText('POLISHING');
  await expect(page.getByLabel('ROPE GUARD 배정 상태')).toContainText('INSPECTION');
  await page.screenshot({ path: 'e2e/polishing-propeller-fin-1440.png', fullPage: true });
});

test('group defaults preserve unit overrides across direct Section navigation', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Vessel name / IMO number / Call Sign').fill('9876543');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByRole('button', { name: 'Polishing 작업 선택' }).click();
  await page.getByRole('button', { name: /Scope 추가$/ }).click();
  await page.getByRole('button', { name: /Scope 만들기$/ }).click();
  await completeVesselDiagram(page);
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
  expect(await page.locator('.report-page').first().evaluate((node) => getComputedStyle(node).fontSize)).toBe('7px');
});

test('the unified photo input assigns UNMATCHED photos to the clicked phase, moves them, and adds directly', async ({ page }) => {
  await buildGeneralScope(page);
  const directoryInput = page.locator('input[type="file"][webkitdirectory]');
  await expect(directoryInput).toHaveAttribute('webkitdirectory', '');
  await directoryInput.setInputFiles('e2e/manual-fixture');
  await expect(page.getByLabel('사진 입력 진행 상태')).toContainText('UNMATCHED');
  await page.getByRole('button', { name: 'Report Input으로' }).click();
  await page.getByRole('button', { name: 'AFTER 불러온 사진 선택' }).click();
  await expect(page.getByLabel('UNMATCHED 사진 배정')).toBeVisible();
  await expect(page.locator('.assignment-target')).toContainText('AFTER');
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
  await page.getByRole('button', { name: 'AFTER 불러온 사진 선택' }).click();
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
  await page.getByRole('button', { name: 'AFTER 새 사진 추가' }).click();
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
  await page.getByLabel('Vessel name / IMO number / Call Sign').fill('9876543');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByRole('button', { name: '전체 적용' }).click();
  await page.getByRole('button', { name: 'Inspection 작업 선택' }).click();
  await page.getByRole('button', { name: 'FWD PORT 작업 배정' }).click();
  await page.screenshot({ path: 'e2e/scope-mixed-1440.png', fullPage: true });
  await page.getByRole('button', { name: /Scope 만들기$/ }).click();
  await expect(page.locator('.scope-ready')).toContainText('총 16 sections');
  await expect(page.locator('.scope-summary')).toContainText('CLEANING 15');
  await expect(page.locator('.scope-summary')).toContainText('INSPECTION 1');
  await completeVesselDiagram(page);

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
  await page.getByLabel('Vessel name / IMO number / Call Sign').fill('9876543');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByRole('button', { name: '전체 적용' }).click();
  await page.getByRole('button', { name: 'Inspection 작업 선택' }).click();
  await page.getByRole('button', { name: 'AFT STBD 작업 배정', exact: true }).click();
  await page.getByRole('button', { name: /Scope 만들기$/ }).click();
  await completeVesselDiagram(page);
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

test('vessel diagram receives real guide, marker, resize, and keyboard input at desktop and narrow widths', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Vessel name / IMO number / Call Sign').fill('9876543');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();
  await page.getByRole('button', { name: '전체 적용' }).click();
  await page.getByRole('button', { name: /Scope 만들기$/ }).click();
  await page.getByRole('button', { name: 'Report Information 입력' }).click();
  await page.getByRole('button', { name: '선박 위치도 설정으로' }).click();
  await page.getByLabel('선박 사이드뷰 이미지').setInputFiles('e2e/fixtures/vessel-side.png');

  const workspace = page.locator('.workspace').filter({ has: page.locator('.vessel-diagram-editor') });
  const editor = page.locator('.vessel-diagram-editor');
  const surface = page.locator('.vessel-diagram-surface');
  const [workspaceBox, editorBox, surfaceBox] = await Promise.all([
    workspace.boundingBox(), editor.boundingBox(), surface.boundingBox(),
  ]);
  expect(workspaceBox).not.toBeNull();
  expect(editorBox).not.toBeNull();
  expect(surfaceBox).not.toBeNull();
  expect(workspaceBox!.x + workspaceBox!.width).toBeLessThanOrEqual(1440);
  expect(editorBox!.x).toBeGreaterThanOrEqual(workspaceBox!.x);
  expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(workspaceBox!.x + workspaceBox!.width + 1);
  expect(surfaceBox!.x).toBeGreaterThanOrEqual(workspaceBox!.x);
  expect(surfaceBox!.x + surfaceBox!.width).toBeLessThanOrEqual(workspaceBox!.x + workspaceBox!.width + 1);
  const editorImageBox = await page.getByLabel('웹 편집 선박 이미지 영역').boundingBox();
  expect(editorImageBox).not.toBeNull();
  expect(editorImageBox!.x).toBeCloseTo(surfaceBox!.x, 0);
  expect(editorImageBox!.width).toBeCloseTo(surfaceBox!.width, 0);
  const panelBox = await page.locator('.diagram-panel').boundingBox();
  const stageBox = await page.locator('.diagram-callout-stage').boundingBox();
  expect(panelBox).not.toBeNull();
  expect(stageBox).not.toBeNull();
  expect(stageBox!.x - panelBox!.x).toBeGreaterThan(panelBox!.width * .04);
  expect(panelBox!.x + panelBox!.width - stageBox!.x - stageBox!.width)
    .toBeGreaterThan(panelBox!.width * .04);

  const sternGuide = page.getByRole('slider', { name: '선미 기준선' });
  const hullTopGuide = page.getByRole('slider', { name: 'Hull 상단선' });
  const initialStern = Number(await sternGuide.getAttribute('x1'));
  const initialHullTop = Number(await hullTopGuide.getAttribute('y1'));
  await page.mouse.move(surfaceBox!.x + surfaceBox!.width * 0.08, surfaceBox!.y + surfaceBox!.height * 0.02);
  await page.mouse.down();
  await page.mouse.move(surfaceBox!.x + surfaceBox!.width * 0.1, surfaceBox!.y + surfaceBox!.height * 0.02, { steps: 4 });
  await page.mouse.up();
  await expect(sternGuide).not.toHaveAttribute('x1', String(initialStern));
  await page.mouse.move(surfaceBox!.x + surfaceBox!.width * 0.98, surfaceBox!.y + surfaceBox!.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(surfaceBox!.x + surfaceBox!.width * 0.98, surfaceBox!.y + surfaceBox!.height * 0.21, { steps: 4 });
  await page.mouse.up();
  await expect(hullTopGuide).not.toHaveAttribute('y1', String(initialHullTop));

  const aftMarker = page.getByRole('button', { name: 'AFT Hull 표식', exact: true });
  const resizeHandle = aftMarker.locator('.marker-handle.se');
  await expect(resizeHandle).toHaveCSS('opacity', '0');
  await expect(resizeHandle).toHaveCSS('pointer-events', 'none');
  const markerBeforeMove = await aftMarker.boundingBox();
  expect(markerBeforeMove).not.toBeNull();
  await page.mouse.move(markerBeforeMove!.x + markerBeforeMove!.width / 2, markerBeforeMove!.y + markerBeforeMove!.height / 2);
  await page.mouse.down();
  await page.mouse.move(markerBeforeMove!.x + markerBeforeMove!.width / 2 - 24, markerBeforeMove!.y + markerBeforeMove!.height / 2 + 8, { steps: 4 });
  await page.mouse.up();
  const markerAfterMove = await aftMarker.boundingBox();
  expect(markerAfterMove!.x).toBeLessThan(markerBeforeMove!.x - 10);

  await expect(resizeHandle).toHaveCSS('opacity', '1');
  await expect(resizeHandle).toHaveCSS('pointer-events', 'auto');
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  expect(handleBox!.width).toBeCloseTo(24, 0);
  expect(handleBox!.height).toBeCloseTo(24, 0);
  expect(await resizeHandle.evaluate((node) => getComputedStyle(node, '::after').width)).toBe('6px');
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  })).toContain('marker-handle se');
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 20, handleBox!.y + handleBox!.height / 2 + 8, { steps: 4 });
  await page.mouse.up();
  const markerAfterResize = await aftMarker.boundingBox();
  expect(markerAfterResize!.width).toBeGreaterThan(markerAfterMove!.width + 8);

  await aftMarker.focus();
  await page.keyboard.press('ArrowRight');
  const markerAfterKeyboard = await aftMarker.boundingBox();
  expect(markerAfterKeyboard!.x).toBeGreaterThan(markerAfterResize!.x);
  await page.screenshot({ path: 'e2e/vessel-editor-1440.png', fullPage: true });

  await page.getByRole('button', { name: 'Niche 맞추기로 이동' }).click();
  const callouts = page.locator('.diagram-callout-label');
  await expect(callouts.first()).toBeVisible();
  const aftServicesCallout = page.getByRole('button', { name: 'Sea Chest / Discharge Pipe 이름표 선택' });
  await expect(aftServicesCallout).toBeVisible();
  expect(await aftServicesCallout.evaluate((node) => (
    node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight
  ))).toBe(true);
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

  const aftTransducer = page.getByRole('button', { name: 'Transducer AFT 표식' });
  const fwdTransducer = page.getByRole('button', { name: 'Transducer FWD 표식' });
  await aftTransducer.click({ modifiers: ['Control'] });
  await fwdTransducer.click({ modifiers: ['Control'] });
  await expect(page.getByRole('toolbar', { name: '표식 정렬' })).toBeVisible();
  await page.getByRole('button', { name: '상단 정렬' }).click();
  const [aftTransducerBox, fwdTransducerBox] = await Promise.all([
    aftTransducer.boundingBox(),
    fwdTransducer.boundingBox(),
  ]);
  expect(aftTransducerBox!.y).toBeCloseTo(fwdTransducerBox!.y, 0);
  const [editorRight, viewportWidth] = await Promise.all([
    editor.evaluate((node) => node.getBoundingClientRect().right),
    page.evaluate(() => window.innerWidth),
  ]);
  expect(editorRight).toBeLessThanOrEqual(viewportWidth);
  await page.screenshot({ path: 'e2e/vessel-editor-callouts-1440.png', fullPage: true });

  await page.setViewportSize({ width: 800, height: 900 });
  const actionColumns = await page.locator('.diagram-control-actions').evaluate((node) => (
    getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length
  ));
  expect(actionColumns).toBe(2);
  await page.screenshot({ path: 'e2e/vessel-editor-narrow.png', fullPage: true });

  await page.getByRole('button', { name: '선박 위치도 설정 완료' }).click();
  await expect(page.getByRole('heading', { name: '사진 폴더' })).toBeVisible();
});

test('linked and Bilge markers produce preview-identical flattened Word PNGs', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Vessel name / IMO number / Call Sign').fill('9876543');
  await page.getByRole('button', { name: 'Vessel 확인' }).click();

  const addNiche = async (component: string, type: string, quantity: number) => {
    await page.getByLabel('Niche component').selectOption(component);
    await page.getByLabel('Niche type').selectOption(type);
    await page.getByLabel('Quantity').fill(String(quantity));
    await page.getByRole('button', { name: /Scope 추가$/ }).click();
  };
  await addNiche('Propeller Blade', 'SINGLE', 1);
  await addNiche('Transducer', 'SINGLE', 1);
  await addNiche('Anode / ICCP', 'SIDE', 1);
  await addNiche('Bilge Keel', 'QUANTITY', 3);
  await page.getByRole('button', { name: /Scope 만들기$/ }).click();
  await completeVesselDiagram(page);
  await page.getByRole('button', { name: 'Report Input으로' }).click();
  const vesselPhoto = await readFile('e2e/fixtures/vessel-side.png');

  const selectSection = async (query: string, expectedSection: string) => {
    await page.getByRole('button', { name: '전체 Section 목록 열기' }).click();
    const picker = page.getByRole('dialog', { name: '전체 Section' });
    await picker.getByRole('searchbox', { name: 'Section 검색' }).fill(query);
    await picker.getByRole('button', { name: /Section 열기/ }).first().click();
    await expect(picker).toHaveCount(0);
    await expect(page.locator('.input-heading')).toContainText(expectedSection);
  };
  const addPreviewPhoto = async (index: number) => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'BEFORE 새 사진 추가' }).click();
    await (await chooser).setFiles({
      name: `vessel-preview-${index}.png`,
      mimeType: 'image/png',
      buffer: vesselPhoto,
    });
  };
  for (const [index, [sectionQuery, expectedSection]] of [
    ['PROPELLER BLADE', 'PROPELLER BLADE'],
    ['TRANSDUCER', 'TRANSDUCER'],
    ['ANODE / ICCP PORT', 'ANODE / ICCP'],
    ['BILGE KEEL 03', 'BILGE KEEL/03'],
  ].entries()) {
    await selectSection(sectionQuery, expectedSection);
    await addPreviewPhoto(index);
    await expect(page.locator('.topbar')).toContainText(`${index + 1} PHOTOS`);
  }

  await page.getByRole('button', { name: 'Check / Preview' }).last().click();
  await expect(page.getByLabel('전체 Report Preview')).toBeVisible();
  const previewSelect = page.getByLabel('Preview section');
  const previewOptions = await previewSelect.locator('option').evaluateAll((options) => options.map((option) => (
    (option as HTMLOptionElement).value
  )));
  const previewHash = async (component: string, unit?: string) => {
    const sectionId = previewOptions.find((value) => value.includes(component) && (!unit || value.includes(unit)));
    expect(sectionId).toBeDefined();
    await previewSelect.selectOption(sectionId!);
    const image = page.getByRole('img', { name: '선박 위치도 미리보기' });
    await expect(image).toBeVisible();
    const source = await image.getAttribute('src');
    expect(source).not.toBeNull();
    return page.evaluate(async (source) => {
      const bytes = await (await fetch(source)).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
    }, source!);
  };
  const previewHashes = [
    await previewHash('PROPELLER BLADE'),
    await previewHash('TRANSDUCER'),
    await previewHash('ANODE / ICCP'),
    await previewHash('BILGE KEEL', '03'),
  ];
  expect(Array.from(new Set(previewHashes))).toHaveLength(4);
  await page.screenshot({ path: 'e2e/vessel-preview-parity-1440.png', fullPage: true });

  await page.getByRole('button', { name: 'Word 준비' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Word 보고서 다운로드' }).click();
  const download = await downloadPromise;
  const outputPath = 'e2e/vessel-diagram-parity.docx';
  await download.saveAs(outputPath);
  const zip = await JSZip.loadAsync(await readFile(outputPath));
  const documentXml = await zip.file('word/document.xml')?.async('text') ?? '';
  const relationshipsXml = await zip.file('word/_rels/document.xml.rels')?.async('text') ?? '';
  const diagramFiles = zip.file(/word\/media\/vessel-diagram-\d+\.png/);
  expect(documentXml).not.toContain('descr="zone_');
  expect(documentXml).toContain('rIdVesselDiagram');
  expect(diagramFiles.length).toBe(4);
  expect((relationshipsXml.match(/Id="rIdVesselDiagram\d+"/g) ?? [])).toHaveLength(4);
  const documentHashes = await Promise.all(diagramFiles.map(async (file) => (
    createHash('sha256').update(await file.async('uint8array')).digest('hex')
  )));
  expect(new Set(documentHashes)).toEqual(new Set(previewHashes));
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

test('packaged server rejects malformed and traversal paths without stopping', async ({ request }) => {
  test.skip(process.env.PACKAGED_DEMO_SERVER !== 'true', 'Requires the packaged server, not the Vite development server');
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
