const { test, expect } = require('@playwright/test');
const { seed, fixture } = require('./helpers/app');

test.use({
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2.625,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
});

async function openEditor(page, viewport) {
  await page.setViewportSize(viewport);
  await seed(page, { state: structuredClone(fixture) });
  await page.locator('#editPlan').tap();
  await expect(page.locator('#planTools')).toBeVisible();
}

async function directlyHittable(page, selector) {
  const result = await page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      visible: r.width > 0 && r.height > 0 &&
        x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
      hittable: !!hit && (hit === el || el.contains(hit)),
    };
  });
  expect(result, selector + ' must be visible and directly hittable WITHOUT scrolling').toEqual({ visible: true, hittable: true });
  await page.locator(selector).tap({ trial: true });
}

for (const viewport of [{ width: 360, height: 640 }, { width: 740, height: 320 }]) {
  test('core Edit Plan controls require no horizontal scroll at ' + viewport.width + 'x' + viewport.height, async ({ page }) => {
    await openEditor(page, viewport);
    const overflow = await page.locator('#planTools').evaluate(el => ({
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
    }));
    expect(overflow.scrollWidth, 'Edit Plan toolbar must not scroll sideways').toBeLessThanOrEqual(overflow.clientWidth + 1);
    for (const selector of ['#line', '#free', '#undo', '#measureWall', '#areaTool', '#finishEdit']) {
      await directlyHittable(page, selector);
    }
    await page.locator('#line').tap();
    await directlyHittable(page, '#undo');
    await directlyHittable(page, '#finishEdit');
  });
}

test('Freehand exposes its options without making Undo disappear', async ({ page }) => {
  await openEditor(page, { width: 360, height: 640 });
  await page.locator('#free').tap();
  await directlyHittable(page, '#undo');
  await directlyHittable(page, '#fspEditMore');
  await page.locator('#fspEditMore').tap();
  await directlyHittable(page, '#drawColor');
  await directlyHittable(page, '#autoWall');
  await directlyHittable(page, '#finishEdit');
});

test('square footage is labeled explicitly', async ({ page }) => {
  await openEditor(page, { width: 360, height: 640 });
  await expect(page.locator('#areaTool')).toContainText('Square Footage');
  await directlyHittable(page, '#areaTool');
});
