const { test, expect, chromium } = require('@playwright/test');
const { seed, saved, deleteMeasurement, fixture, KEY, TARGET } = require('./helpers/app');
const MIRROR = KEY + '-full-mirror-v1748';

async function writeCopy(page, backend, snapshot) {
  await page.evaluate(async ({ backend, snapshot, key, mirror }) => {
    if (backend !== 'indexedDB') {
      localStorage.setItem(backend === 'legacy' ? key : mirror, JSON.stringify(snapshot)); return;
    }
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('fsp-test-isolated-v1', 1);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const t = db.transaction('state', 'readwrite'); t.objectStore('state').put(snapshot, key);
        t.oncomplete = resolve; t.onerror = () => reject(t.error);
      });
    } finally { db.close(); }
  }, { backend, snapshot, key: KEY, mirror: MIRROR });
}

for (const backend of ['legacy', 'mirror', 'indexedDB']) {
  test(`repair KD-004: deletion survives stale ${backend} and closed-context reopening`, async ({ page, browser }) => {
    await seed(page, { legacy: true }); await deleteMeasurement(page);
    const current = await saved(page);
    expect(current.surveys[0].plans[0].dimensions).toHaveLength(1);
    expect(current.surveys[0].plans[0]._fspMeasurementDeletions).toEqual({ version: 1, ids: ['dim-x'] });
    await writeCopy(page, backend, fixture);
    // Capture both persistent backends before closing; pagehide may flush the
    // active page, so reopen the captured conflicting state in a fresh context.
    const state = await page.context().storageState({ indexedDB: true });
    await page.context().close();
    const context = await browser.newContext({ storageState: state });
    try {
      const reopened = await context.newPage(); await reopened.goto('http://127.0.0.1:8765' + TARGET);
      await reopened.locator('#continue').click();
      const data = await saved(reopened); const plan = data.surveys[0].plans[0];
      expect(plan.dimensions.map(d => d.id)).toEqual(['dim-y']);
      expect(plan.areas).toHaveLength(0);
      expect(plan.walls).toEqual(fixture.surveys[0].plans[0].walls);
      expect(plan.cameras).toEqual(fixture.surveys[0].plans[0].cameras);
      expect(plan.fspRoutes).toEqual(fixture.surveys[0].plans[0].fspRoutes);
      expect(data.surveys[0].plans[1]).toEqual(fixture.surveys[0].plans[1]);
    } finally { await context.close(); }
  });
}

test('measurement Undo records deletion and cannot be revived from legacy copy', async ({ page }) => {
  await seed(page, { legacy: true }); await page.locator('#editPlan').click();
  await page.locator('#measureWall').click();
  await page.locator('#undo').click();
  const before = await saved(page);
  expect(before.surveys[0].plans[0].dimensions.map(d => d.id)).toEqual(['dim-x']);
  await page.reload(); await page.locator('#continue').click();
  const after = await saved(page);
  expect(after.surveys[0].plans[0].dimensions.map(d => d.id)).toEqual(['dim-x']);
  expect(after.surveys[0].plans[0].walls).toEqual(fixture.surveys[0].plans[0].walls);
});

test('legacy backup import/export preserves unknown fields and intentional restore', async ({ page }) => {
  const old = structuredClone(fixture);
  old.futureMetadata = { source: 'synthetic compatibility test' };
  old.surveys[0].plans[0].futureGeometry = { retained: true };
  await seed(page, { state: old, legacy: true }); await deleteMeasurement(page); await saved(page);
  await page.locator('#plans header [data-go="home"]').click();
  await page.locator('#allSurveys').click();
  await page.locator('#backupFile').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await page.locator('#modalOk').click();
  const imported = await saved(page);
  expect(imported.futureMetadata).toEqual(old.futureMetadata);
  expect(imported.surveys[0].plans[0].futureGeometry).toEqual(old.surveys[0].plans[0].futureGeometry);
  expect(imported.surveys[0].plans[0].dimensions).toHaveLength(2);
  const downloadEvent = page.waitForEvent('download'); await page.locator('#exportBackup').click();
  const download = await downloadEvent; const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported).toEqual(imported);
  await page.reload(); await page.locator('#continue').click();
  expect((await saved(page)).surveys[0].plans[0].dimensions).toHaveLength(2);
});

test('deletion survives an actual browser process restart with retained profile', async ({}, testInfo) => {
  const options = { headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) };
  const profile = testInfo.outputPath('synthetic-profile');
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = await context.newPage(); await seed(page, { legacy: true, target: 'http://127.0.0.1:8765' + TARGET });
    await deleteMeasurement(page); await saved(page); await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = await context.newPage(); await page.goto('http://127.0.0.1:8765' + TARGET); await page.locator('#continue').click();
    expect((await saved(page)).surveys[0].plans[0].dimensions.map(d => d.id)).toEqual(['dim-y']);
  } finally { await context.close(); }
});

test('all measurement deletions accumulate and survive repeated reopen', async ({ page }) => {
  await seed(page, { legacy: true }); await deleteMeasurement(page); await saved(page);
  // The first deletion leaves the editor open and the remaining dimension at index 0.
  await page.locator('[data-overlay-dimension="0"]').first().dispatchEvent('click');
  await page.locator('#dimensionPositionDone').click();
  await page.getByRole('button', { name: 'Delete Measurement', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    const data = await saved(page); const plan = data.surveys[0].plans[0];
    expect(plan.dimensions).toEqual([]); expect(plan.areas).toEqual([]);
    expect(plan._fspMeasurementDeletions.ids.sort()).toEqual(['dim-x', 'dim-y']);
    await page.reload(); await page.locator('#continue').click();
  }
  expect((await saved(page)).surveys[0].plans[0].dimensions).toEqual([]);
});

test('plan-local deletion IDs do not remove a same-ID measurement on another plan', async ({ page }) => {
  const state = structuredClone(fixture);
  state.surveys[0].plans[1].dimensions = [structuredClone(state.surveys[0].plans[0].dimensions[0])];
  await seed(page, { state, legacy: true }); await deleteMeasurement(page); await saved(page);
  await page.reload(); await page.locator('#continue').click();
  const plans = (await saved(page)).surveys[0].plans;
  expect(plans[0].dimensions.map(d => d.id)).toEqual(['dim-y']);
  expect(plans[1].dimensions.map(d => d.id)).toEqual(['dim-x']);
});

test('a failed mirror write still saves deletion in IndexedDB and recovers', async ({ page, browser }) => {
  await seed(page, { legacy: true }); await saved(page);
  await page.evaluate(mirror => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === mirror) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  }, MIRROR);
  await deleteMeasurement(page);
  await expect(page.locator('#save')).toHaveText('Saved (1 copy) ✓');
  const state = await page.context().storageState({ indexedDB: true });
  await page.context().close();
  const context = await browser.newContext({ storageState: state });
  try {
    const reopened = await context.newPage(); await reopened.goto('http://127.0.0.1:8765' + TARGET);
    await reopened.locator('#continue').click();
    expect((await saved(reopened)).surveys[0].plans[0].dimensions.map(d => d.id)).toEqual(['dim-y']);
  } finally { await context.close(); }
});

test('a new measurement survives a same-length stale copy after deletion', async ({ page, browser }) => {
  await seed(page, { legacy: true }); await deleteMeasurement(page);
  const current = await saved(page);
  const replacement = structuredClone(fixture.surveys[0].plans[0].dimensions[0]);
  replacement.id = 'new-dimension'; replacement.measure.feet = 120;
  current.surveys[0].plans[0].dimensions.push(replacement);
  await writeCopy(page, 'mirror', current);
  await writeCopy(page, 'indexedDB', fixture);
  const state = await page.context().storageState({ indexedDB: true }); await page.context().close();
  const context = await browser.newContext({ storageState: state });
  try {
    const reopened = await context.newPage(); await reopened.goto('http://127.0.0.1:8765' + TARGET);
    await reopened.locator('#continue').click();
    const plan = (await saved(reopened)).surveys[0].plans[0];
    expect(plan.dimensions.map(d => d.id).sort()).toEqual(['dim-y', 'new-dimension']);
    expect(plan.areas[0].sqft).toBe(6000);
  } finally { await context.close(); }
});
