import { expect, test } from '@playwright/test';

test('the full A4 cover preview stays visible at supported desktop widths', async ({ page }) => {
  await page.route('https://marine-ops-dashboard.vercel.app/api/vessels**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ matches: [{ vesselName: 'MSC JAVELIN IX', imoNo: '9467415' }] }),
  }));
  await page.route('https://marine-ops-dashboard.vercel.app/api/chainportal**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ matches: [] }),
  }));
  await page.goto('./');
  await page.getByLabel('Vessel name / IMO number / Call Sign').fill('MSC JAVELIN IX');
  await page.getByRole('button', { name: 'Vessel 확인', exact: true }).click();
  await page.getByLabel('Job No', { exact: true }).fill('US-CLS-2608007');
  await page.getByRole('button', { name: 'FWD PORT 작업 배정' }).click();
  await page.getByRole('button', { name: /Scope 만들기$/ }).click();
  await page.getByRole('button', { name: 'Report Information 입력', exact: true }).click();
  await page.getByRole('button', { name: '커버 설정으로', exact: true }).click();

  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    const frame = page.locator('.cover-preview-scroll');
    const preview = page.getByRole('article', { name: 'A4 표지 미리보기' });
    const frameBounds = await frame.boundingBox();
    const previewBounds = await preview.boundingBox();
    expect(frameBounds).not.toBeNull();
    expect(previewBounds).not.toBeNull();
    expect(previewBounds!.width).toBe(595);
    expect(previewBounds!.height).toBe(842);
    expect(previewBounds!.x).toBeGreaterThanOrEqual(frameBounds!.x);
    expect(previewBounds!.x + previewBounds!.width).toBeLessThanOrEqual(frameBounds!.x + frameBounds!.width);
    expect(await frame.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  }
});
