const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { seed, saved, point, drag, cameraMode, deleteMeasurement, fixture, TARGET } = require('./helpers/app');

test('V17.121 starts without script or cable initialization errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(TARGET);
  await page.locator('#newSurvey').click();
  await expect(page.locator('#modalTitle')).toHaveText('New Survey');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.fspCableError || null)).toBeNull();
  expect(await page.evaluate(() => typeof window.fspCableEnter)).toBe('function');
  await expect(page).toHaveTitle(/V17\.121/);
});

test('create named survey and autosave to IndexedDB and mirror', async ({ page }) => {
  await page.goto(TARGET);
  await page.locator('#newSurvey').click();
  await page.locator('#newName').fill('Synthetic new survey');
  await page.locator('#modalOk').click();
  const data = await saved(page);
  expect(data.surveys).toHaveLength(1);
  expect(data.surveys[0].name).toBe('Synthetic new survey');
  const copies = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('mirror')).map(k => JSON.parse(localStorage.getItem(k))));
  expect(copies).toContainEqual(data);
});

test('save, close context, reopen from retained local storage', async ({ page, browser }) => {
  await seed(page);
  await saved(page);
  // Playwright storageState retains localStorage; this deliberately tests recovery
  // without IndexedDB. A separate test below exercises IndexedDB-only recovery.
  const state = await page.context().storageState();
  await page.context().close();
  const context = await browser.newContext({ storageState: state });
  try {
    const reopened = await context.newPage();
    await reopened.goto('http://127.0.0.1:8765' + TARGET);
    await reopened.locator('#continue').click();
    await expect(reopened.locator('#plansTitle')).toHaveText('Synthetic regression site');
    const data = await saved(reopened);
    expect(data.surveys[0].plans[0].fspRoutes[0].points).toHaveLength(4);
    expect(data.surveys[0].plans).toHaveLength(2);
  } finally { await context.close(); }
});

test('IndexedDB alone restores the saved survey after reload', async ({ page }) => {
  await seed(page); const before = await saved(page);
  // This clears only the disposable context's synthetic localStorage.
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.locator('#continue').click();
  const after = await saved(page);
  expect(after.surveys[0].plans[0].cameras).toEqual(before.surveys[0].plans[0].cameras);
  expect(after.surveys[0].plans[0].fspRoutes).toEqual(before.surveys[0].plans[0].fspRoutes);
});

test('measurement deletion invalidates area and survives reload with current snapshots', async ({ page }) => {
  await seed(page); await deleteMeasurement(page);
  let data = await saved(page);
  expect(data.surveys[0].plans[0].dimensions).toHaveLength(1);
  expect(data.surveys[0].plans[0].areas).toHaveLength(0);
  expect(data.surveys[0].plans[0].walls).toHaveLength(4);
  await page.reload(); await page.locator('#continue').click(); data = await saved(page);
  expect(data.surveys[0].plans[0].dimensions).toHaveLength(1);
  expect(data.surveys[0].plans[0].areas).toHaveLength(0);
});

test('[published V17.121] KD-004 stale legacy snapshot must not resurrect a deleted measurement', async ({ page }) => {
  // Keep the published-snapshot reproduction; repaired behavior is tested separately.
  await seed(page, { legacy: true, target: '/test/v17-121/' }); await deleteMeasurement(page);
  expect((await saved(page)).surveys[0].plans[0].dimensions).toHaveLength(1);
  await page.reload(); await page.locator('#continue').click();
  const data = await saved(page);
  test.fail(true, 'KD-004: mergeSaved favors longer legacy arrays; see docs/known-defects.md');
  expect(data.surveys[0].plans[0].dimensions).toHaveLength(1);
});

test('camera placement allocates number across plans and persists', async ({ page }) => {
  await seed(page); await cameraMode(page);
  await page.locator('#addCamera').click();
  const target = await point(page, 250, 250); await page.mouse.click(target.x, target.y);
  const data = await saved(page); const cameras = data.surveys[0].plans[0].cameras;
  expect(cameras).toHaveLength(2);
  expect(cameras[1]).toMatchObject({ num: '3', type: 'New' });
  expect(cameras[1].x).toBeCloseTo(250, 0); expect(cameras[1].y).toBeCloseTo(250, 0);
});

test('camera drag moves only camera and anchors connected route start', async ({ page }) => {
  await seed(page); await cameraMode(page);
  const before = await saved(page); const box = await page.locator('#surveyCanvas').getAttribute('viewBox');
  await drag(page, await point(page, 350, 350), await point(page, 400, 380));
  const data = await saved(page); const plan = data.surveys[0].plans[0];
  expect(plan.cameras[0].x).toBeCloseTo(400, 0);
  expect(plan.cameras[0].y).toBeCloseTo(380, 0);
  expect(plan.walls).toEqual(before.surveys[0].plans[0].walls);
  expect(plan.fspRoutes[0].points[0]).toMatchObject({ x: plan.cameras[0].x, y: plan.cameras[0].y });
  expect(await page.locator('#surveyCanvas').getAttribute('viewBox')).toBe(box);
});

test('cone adjustment persists angle without moving camera or viewport', async ({ page }) => {
  await seed(page); await cameraMode(page);
  const camera = await point(page, 350, 350); await page.mouse.click(camera.x, camera.y);
  const handle = await page.locator('[data-handle="cam-1"]').boundingBox();
  const box = await page.locator('#surveyCanvas').getAttribute('viewBox');
  await drag(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: handle.x + handle.width / 2 - 30, y: handle.y + handle.height / 2 + 50 });
  const data = await saved(page); const c = data.surveys[0].plans[0].cameras[0];
  expect(Math.abs(c.angle)).toBeGreaterThan(1); expect(c.x).toBe(350); expect(c.y).toBe(350);
  expect(await page.locator('#surveyCanvas').getAttribute('viewBox')).toBe(box);
});

for (const type of ['MDF', 'IDF']) {
test(`${type} drag updates connected endpoint and preserves intermediate bends`, async ({ page }) => {
  const state = structuredClone(fixture); state.surveys[0].plans[0].fspRacks[0].type = type;
  await seed(page, { state }); await cameraMode(page);
  const before = (await saved(page)).surveys[0].plans[0];
  await drag(page, await point(page, 800, 450), await point(page, 750, 500));
  const plan = (await saved(page)).surveys[0].plans[0]; const rack = plan.fspRacks[0];
  expect(rack.x).toBeCloseTo(750, 0); expect(rack.y).toBeCloseTo(500, 0);
  expect(plan.fspRoutes[0].points.at(-1)).toEqual({ x: rack.x, y: rack.y });
  expect(plan.fspRoutes[0].points.slice(0, -1)).toEqual(before.fspRoutes[0].points.slice(0, -1));
});

}

test('KD-001 cable simplification preserves a sampled right-angle bend', async () => {
  // Execute the exact shipped functions, not a duplicated test implementation.
  // This supplemental algorithm test does not replace future route-drawing UI coverage.
  const html = readFileSync('development/index.html', 'utf8');
  const slice = (a, b) => { const start = html.indexOf(a); const end = html.indexOf(b, start); expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start); return html.slice(start, end); };
  const context = vm.createContext({});
  vm.runInContext(slice('function dist(a,b)', 'function appendPath(') + slice('function straighten(', 'function closestRack('), context);
  const points = Array.from({ length: 21 }, (_, i) => ({ x: Math.min(i, 10) * 5, y: Math.max(0, i - 10) * 5 }));
  const result = context.straighten(points);
  test.fail(true, 'KD-001: cable simplifier discards right-angle corners');
  expect(result).toContainEqual({ x: 50, y: 0 });
});

test('KD-002 Camera Details drag changes rendered panel position', async ({ page }) => {
  await seed(page); await cameraMode(page);
  const c = await point(page, 350, 350); await page.mouse.move(c.x, c.y); await page.mouse.down();
  await expect(page.locator('#detail')).toBeVisible(); await page.mouse.up();
  await expect(page.locator('#detailType')).toContainText('Existing');
  const before = await page.locator('#detail').boundingBox(); const handle = await page.locator('#detailDrag').boundingBox();
  await drag(page, { x: handle.x + 20, y: handle.y + 10 }, { x: handle.x + 120, y: handle.y - 80 });
  const after = await page.locator('#detail').boundingBox();
  test.fail(true, 'KD-002: important CSS overrides inline drag positions');
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(30);
});

for (const entry of ['Draw', 'Edit']) {
  test(`KD-003 ${entry} entry must start without an active drawing tool`, async ({ page }) => {
    await seed(page);
    if (entry === 'Edit') await page.locator('#editPlan').click();
    else { await page.locator('#addPlan').click(); await page.getByRole('button', { name: 'Draw Plan', exact: true }).click(); }
    const tool = await page.locator('#planCanvas').getAttribute('data-active-tool');
    test.fail(true, 'KD-003: entry handler explicitly selects line');
    expect(tool).toBe('pan');
  });
}

test('offline camera changes retain geometry after network returns and reload', async ({ page, context }) => {
  await seed(page); await cameraMode(page); await context.setOffline(true);
  await drag(page, await point(page, 350, 350), await point(page, 400, 380));
  const before = await saved(page);
  await context.setOffline(false); await page.reload(); await page.locator('#continue').click();
  const after = await saved(page);
  expect(after.surveys[0].plans[0].cameras).toEqual(before.surveys[0].plans[0].cameras);
  expect(after.surveys[0].plans[0].fspRoutes).toEqual(before.surveys[0].plans[0].fspRoutes);
});


test('changing a measurement recalculates square footage and persists', async ({ page }) => {
  await seed(page); await page.locator('#editPlan').click();
  await page.locator('[data-overlay-dimension="0"]').first().dispatchEvent('click');
  await page.locator('#dimensionPositionDone').click();
  await page.locator('#oDistance').fill('120'); await page.locator('#modalOk').click();
  const before = await saved(page);
  expect(before.surveys[0].plans[0].areas[0].sqft).toBe(6000);
  await page.reload(); await page.locator('#continue').click();
  expect((await saved(page)).surveys[0].plans[0].areas[0].sqft).toBe(6000);
});
