const { test, expect, chromium } = require('@playwright/test');
const { seed, saved, fixture, drag, KEY, TARGET } = require('./helpers/app');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const MIRROR = KEY + '-full-mirror-v1748';
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => { const errors = []; pageErrors.set(page, errors); page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(async ({ page }) => { expect(pageErrors.get(page) || []).toEqual([]); });
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
}
async function view(page, canvas = 'planCanvas') {
  await settle(page);
  return page.locator('#' + canvas).evaluate(svg => {
    const scene = svg.querySelector('g'), m = scene.getScreenCTM();
    return { points: [[100, 100], [900, 100], [900, 600], [100, 600]].map(([x, y]) => {
      const q = new DOMPoint(x, y).matrixTransform(m); return { x: q.x, y: q.y };
    }), scale: Math.hypot(m.a, m.b), rotation: Math.atan2(m.b, m.a) };
  });
}
function sameView(actual, expected) {
  expect(actual.scale).toBeCloseTo(expected.scale, 5);
  expect(actual.rotation).toBeCloseTo(expected.rotation, 5);
  actual.points.forEach((p, i) => {
    expect(Math.abs(p.x - expected.points[i].x)).toBeLessThan(.1);
    expect(Math.abs(p.y - expected.points[i].y)).toBeLessThan(.1);
  });
}
function unrelated(state) {
  const result = structuredClone(state);
  for (const s of result.surveys) {
    delete s.updated;
    for (const p of s.plans) {
      delete p.viewState;
      // Existing Done behavior refreshes derived area IDs; compare their content.
      for (const a of p.areas || []) if (a.kind === 'auto-drawn') delete a.id;
    }
  }
  return result;
}
async function pan(page, canvas = 'planCanvas') {
  const r = await page.locator('#' + canvas).boundingBox();
  await drag(page, { x: r.x + r.width * .35, y: r.y + r.height * .55 },
    { x: r.x + r.width * .35 + 31, y: r.y + r.height * .55 + 23 });
  await settle(page);
}
for (const viewport of [{ width: 1100, height: 850 }, { width: 412, height: 915 }]) {
  test(`viewport exact Done/Edit/reload and survey-data integrity at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport); await seed(page); await settle(page);
    const before = unrelated(await saved(page));
    await page.locator('#zoomIn').click(); await pan(page);
    const normal = await view(page);
    for (let i = 0; i < 3; i++) {
      await page.locator('#editPlan').click(); sameView(await view(page), normal);
      await page.locator('#finishEdit').click(); await expect(page.locator('#editPlan')).toBeVisible();
      sameView(await view(page), normal);
    }
    await saved(page); await page.reload(); await page.locator('#continue').click();
    sameView(await view(page), normal);
    expect(unrelated(await saved(page))).toEqual(before);
  });
}

test('viewport per-plan zoom/pan survives switching and shared camera view', async ({ page }) => {
  await seed(page); await settle(page);
  await page.locator('#zoomIn').click(); await pan(page); const first = await view(page);
  await page.locator('#planSelect').selectOption('plan-2'); await settle(page);
  await page.locator('#zoomOut').click(); await pan(page); const second = await view(page);
  expect(second.scale).not.toBeCloseTo(first.scale, 2);
  await page.locator('#planSelect').selectOption('plan-1'); sameView(await view(page), first);
  await page.locator('#toSurvey').click(); sameView(await view(page, 'surveyCanvas'), first);
  await page.locator('#surveyPlanSelect').selectOption('plan-2', { force: true }); sameView(await view(page, 'surveyCanvas'), second);
  await page.locator('#surveyDone').click(); sameView(await view(page), second);
  await page.reload(); await page.locator('#continue').click(); sameView(await view(page), second);
  await page.locator('#planSelect').selectOption('plan-1'); sameView(await view(page), first);
});

test('viewport manual rotation retains zoom through resizing and duplicate orientation events', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 }); await seed(page); await settle(page);
  await page.locator('#zoomIn').click(); await pan(page); const before = await view(page);
  await page.setViewportSize({ width: 915, height: 412 }); sameView(await view(page), before);
  await page.evaluate(() => { window.dispatchEvent(new Event('orientationchange')); window.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(400); sameView(await view(page), before);
  await page.locator('#rotatePlanView').click(); const rotated = await view(page);
  expect(rotated.scale).toBeCloseTo(before.scale, 5);
  expect(rotated.rotation).not.toBeCloseTo(before.rotation, 3);
  await page.locator('#editPlan').click(); sameView(await view(page), rotated);
  await page.locator('#finishEdit').click(); await expect(page.locator('#editPlan')).toBeVisible(); sameView(await view(page), rotated);
  await page.reload(); await page.locator('#continue').click(); sameView(await view(page), rotated);
});

for (const backend of ['mirror', 'legacy', 'indexedDB']) {
  test(`viewport reconciliation selects newer valid ${backend} without replacing survey geometry`, async ({ page, browser }) => {
    await seed(page); await saved(page);
    const older = structuredClone(fixture), newer = structuredClone(fixture);
    older.surveys[0].plans[0].viewState = { cx: 500, cy: 350, unitsPerPixel: 2, rotation: 0 };
    newer.surveys[0].updated = Date.now();
    newer.surveys[0].plans[0].viewState = { cx: 250, cy: 220, unitsPerPixel: 1, rotation: 0 };
    await page.evaluate(async ({ key, mirror, older, newer, backend }) => {
      localStorage.setItem(mirror, JSON.stringify(backend === 'mirror' ? newer : older));
      localStorage.setItem(key, JSON.stringify(backend === 'legacy' ? newer : older));
      const db = await new Promise(resolve => { const r = indexedDB.open('fsp-test-isolated-v1', 1); r.onsuccess = () => resolve(r.result); });
      await new Promise(resolve => { const t = db.transaction('state', 'readwrite'); t.objectStore('state').put(backend === 'indexedDB' ? newer : older, key); t.oncomplete = resolve; }); db.close();
    }, { key: KEY, mirror: MIRROR, older, newer, backend });
    const storageState = await page.context().storageState({ indexedDB: true });
    const context = await browser.newContext({ storageState });
    try {
      const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click(); await settle(reopened);
      const data = await saved(reopened), v = data.surveys[0].plans[0].viewState;
      expect(v.unitsPerPixel).toBeCloseTo(1, 5);
      expect(v.cx).toBeCloseTo(250, 4); expect(v.cy).toBeCloseTo(220, 4);
      expect(data.surveys[0].plans[0].walls).toEqual(fixture.surveys[0].plans[0].walls);
      expect(data.surveys[0].plans[0].cameras).toEqual(fixture.surveys[0].plans[0].cameras);
      expect(data.surveys[0].plans[0].fspRoutes).toEqual(fixture.surveys[0].plans[0].fspRoutes);
    } finally { await context.close(); }
  });
}

async function drawScreenRectangle(page) {
  const r = await page.locator('#planCanvas').boundingBox();
  const points = [[.3, .3], [.7, .3], [.7, .58], [.3, .58], [.3, .3]]
    .map(([x, y]) => ({ x: r.x + x * r.width, y: r.y + y * r.height }));
  await page.locator('#line').click();
  const original = await view(page);
  for (let i = 0; i < 4; i++) {
    await drag(page, points[i], points[i + 1]);
    sameView(await view(page), original);
  }
  return original;
}
for (const rotation of [0, 90]) {
  test(`viewport new rectangle stays fixed as bounds grow at rotation ${rotation}`, async ({ page }) => {
    await page.setViewportSize(rotation ? { width: 1100, height: 850 } : { width: 412, height: 915 });
    await seed(page); await settle(page);
    const previousPlans = (await saved(page)).surveys[0].plans;
    await page.locator('#addPlan').click(); await page.getByRole('button', { name: 'Draw Plan', exact: true }).click(); await settle(page);
    const before = await drawScreenRectangle(page);
    const data = await saved(page), sv = data.surveys[0], p = sv.plans.find(p => p.id === sv.activePlan);
    expect(p.walls).toHaveLength(4); expect(p.viewState.rotation).toBe(rotation);
    expect(p.viewState).toEqual(await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)).surveys[0].plans.find(p => p.id === id).viewState,
      { key: MIRROR, id: p.id }));
    await page.locator('#finishEdit').click(); await expect(page.locator('#editPlan')).toBeVisible(); sameView(await view(page), before);
    await page.locator('#editPlan').click(); sameView(await view(page), before);
    await page.locator('#finishEdit').click(); await expect(page.locator('#editPlan')).toBeVisible();
    await page.reload(); await page.locator('#continue').click(); sameView(await view(page), before);
    const after = (await saved(page)).surveys[0];
    expect(after.plans.find(x => x.id === p.id).walls).toEqual(p.walls);
    expect(after.plans.slice(0, previousPlans.length)).toEqual(previousPlans);
  });
}

test('viewport automatic rotation and per-plan overrides retain scale and geometry', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const state = structuredClone(fixture); state.surveys[0].plans[0].viewRotationOverride = null;
  await seed(page, { state }); await settle(page); await page.locator('#zoomIn').click(); await pan(page);
  const before = await view(page);
  await page.setViewportSize({ width: 915, height: 412 }); const turned = await view(page);
  expect(turned.scale).toBeCloseTo(before.scale, 5); expect(Math.abs(turned.rotation - before.rotation)).toBeCloseTo(Math.PI / 2, 5);
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange'))); sameView(await view(page), turned);
  await page.reload(); await page.locator('#continue').click(); sameView(await view(page), turned);
  await page.locator('#planSelect').selectOption('plan-2'); await settle(page);
  expect((await view(page)).rotation).toBeCloseTo(0, 5);
  await page.locator('#planSelect').selectOption('plan-1'); sameView(await view(page), turned);
  await page.setViewportSize({ width: 412, height: 915 }); sameView(await view(page), before);
  expect((await saved(page)).surveys[0].plans[0].walls).toEqual(fixture.surveys[0].plans[0].walls);
});

test('viewport survives actual Chromium process restart with retained localStorage and IndexedDB', async ({ baseURL }) => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-viewport-'));
  const options = { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true, baseURL, viewport: { width: 412, height: 915 } };
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, options);
    let page = await context.newPage(); await seed(page); await settle(page);
    await page.locator('#zoomIn').click(); await page.locator('#editPlan').click(); await settle(page); await pan(page);
    const before = await view(page), data = await saved(page);
    await context.close(); context = null;
    context = await chromium.launchPersistentContext(profile, options);
    page = await context.newPage(); await page.goto(TARGET); await page.locator('#continue').click();
    sameView(await view(page), before);
    expect(unrelated(await saved(page))).toEqual(unrelated(data));
  } finally { if (context) await context.close(); await fs.rm(profile, { recursive: true, force: true }); }
});

async function slowWrites(page) {
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    IDBDatabase.prototype.transaction = function (...args) {
      const t = transaction.apply(this, args);
      if (args[1] === 'readwrite') Object.defineProperty(t, 'oncomplete', {
        set(fn) { descriptor.set.call(t, e => setTimeout(() => fn(e), window.delayViewportSaves ? 180 : 0)); }
      });
      return t;
    };
  });
}

test('viewport Done awaits concurrent saves and cannot finish a different edit session', async ({ page }) => {
  await slowWrites(page); await seed(page); await settle(page); await saved(page);
  await page.locator('#editPlan').click(); await settle(page);
  await page.evaluate(() => { window.delayViewportSaves = true; document.querySelector('#finishEdit').click(); document.querySelector('#zoomIn').click(); });
  await expect(page.locator('#editPlan')).toBeVisible(); const first = await view(page); await saved(page);
  await page.locator('#editPlan').click(); await settle(page);
  await page.evaluate(() => {
    document.querySelector('#finishEdit').click();
    const select = document.querySelector('#planSelect'); select.value = 'plan-2'; select.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(450); await expect(page.locator('#drawingDoneBar')).toBeVisible();
  const state = await saved(page); expect(state.surveys[0].activePlan).toBe('plan-2');
  await page.locator('#finishEdit').click(); await expect(page.locator('#editPlan')).toBeVisible();
  await page.locator('#planSelect').selectOption('plan-1'); sameView(await view(page), first);
});

test('viewport background mirror retains latest in-flight pan ahead of older queued IDB saves', async ({ page, browser }) => {
  await slowWrites(page); await seed(page); await settle(page); await saved(page);
  await page.evaluate(() => { window.delayViewportSaves = true; });
  await page.locator('#zoomIn').click();
  const r = await page.locator('#planCanvas').boundingBox();
  await page.mouse.move(r.x + r.width * .4, r.y + r.height * .5); await page.mouse.down();
  await page.mouse.move(r.x + r.width * .4 + 51, r.y + r.height * .5 + 37, { steps: 4 });
  const before = await view(page);
  // Android may background/terminate without delivering pointerup.
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
  const storageState = await page.context().storageState({ indexedDB: true });
  const context = await browser.newContext({ storageState });
  try {
    const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click(); sameView(await view(reopened), before);
    expect((await saved(reopened)).surveys[0].plans[0].fspRoutes).toEqual(fixture.surveys[0].plans[0].fspRoutes);
  } finally { await context.close(); }
  await page.mouse.up();
});

test('viewport Android touch pinch/pan survives Done/Edit/reopen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36' });
  try {
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await seed(page); await settle(page); const original = await view(page), baseline = unrelated(await saved(page));
    const r = await page.locator('#planCanvas').boundingBox(), x = r.x + r.width / 2, y = r.y + r.height * .45;
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    await touch('touchStart', [[x - 25, y], [x + 25, y]]);
    for (let d = 30; d <= 60; d += 5) await touch('touchMove', [[x - d, y], [x + d, y]]);
    await touch('touchEnd', []); await settle(page);
    expect((await view(page)).scale).toBeGreaterThan(original.scale * 1.5);
    await touch('touchStart', [[x, y]]); await touch('touchMove', [[x + 30, y + 25]]); await touch('touchEnd', []);
    const before = await view(page);
    // Exercise actual touch navigation; activate mode controls with mouse input.
    // Linux Chromium suppresses compatibility clicks after prevented touch
    // pointerdown, reproduced on the unchanged baseline too. Real phone taps
    // remain a separate acceptance check; no button workaround is added.
    await page.locator('#editPlan').click(); await expect(page.locator('#drawingDoneBar')).toBeVisible(); sameView(await view(page), before);
    await page.locator('#finishEdit').click(); await expect(page.locator('#editPlan')).toBeVisible(); sameView(await view(page), before);
    await saved(page); await page.reload(); await page.locator('#continue').click(); sameView(await view(page), before);
    expect(unrelated(await saved(page))).toEqual(baseline); expect(errors).toEqual([]);
  } finally { await context.close(); }
});

async function reopenCopies(page, browser, { idb, mirror, legacy }) {
  await page.evaluate(async ({ key, mirrorKey, idb, mirror, legacy }) => {
    if (mirror) localStorage.setItem(mirrorKey, JSON.stringify(mirror)); else localStorage.removeItem(mirrorKey);
    if (legacy) localStorage.setItem(key, JSON.stringify(legacy)); else localStorage.removeItem(key);
    const db = await new Promise(resolve => { const r = indexedDB.open('fsp-test-isolated-v1', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise(resolve => { const t = db.transaction('state', 'readwrite');
      if (idb) t.objectStore('state').put(idb, key); else t.objectStore('state').delete(key); t.oncomplete = resolve; }); db.close();
  }, { key: KEY, mirrorKey: MIRROR, idb, mirror, legacy });
  return browser.newContext({ storageState: await page.context().storageState({ indexedDB: true }) });
}

test('viewport v2 timestamp beats unrelated survey edits and keeps its rotation override', async ({ page, browser }) => {
  await seed(page); await settle(page); await page.locator('#zoomIn').click(); await pan(page);
  const fresh = await saved(page), old = structuredClone(fresh), legacy = structuredClone(fresh);
  old.surveys[0].updated = Date.now() + 100000;
  old.surveys[0].plans[0].viewState.updatedAt = 100;
  old.surveys[0].plans[0].viewState.unitsPerPixel = 3;
  old.surveys[0].plans[0].viewRotationOverride = 180;
  legacy.surveys[0].plans[0].viewState = { cx: 500, cy: 350, unitsPerPixel: 4, rotation: 0 };
  legacy.surveys[0].updated = 1;
  const expected = await view(page), context = await reopenCopies(page, browser, { idb: old, mirror: fresh, legacy });
  try {
    const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click(); sameView(await view(reopened), expected);
    const state = await saved(reopened); expect(state.surveys[0].plans[0].viewRotationOverride).toBe(0);
    expect(state.surveys[0].plans[0].dimensions).toEqual(fixture.surveys[0].plans[0].dimensions);
  } finally { await context.close(); }
});

for (const malformedOnly of [false, true]) {
  test(`viewport malformed state ${malformedOnly ? 'fits safely when no valid copy exists' : 'cannot hide a valid mirror'}`, async ({ page, browser }) => {
    await seed(page); await settle(page); await page.locator('#zoomIn').click(); const expected = await view(page), valid = await saved(page), bad = structuredClone(valid);
    Object.assign(bad.surveys[0].plans[0].viewState, { unitsPerPixel: 0, originX: null, updatedAt: Date.now() + 10000 });
    const context = await reopenCopies(page, browser, { idb: bad, mirror: malformedOnly ? bad : valid });
    try {
      const reopened = await context.newPage(), errors = []; reopened.on('pageerror', e => errors.push(e.message));
      await reopened.goto(TARGET); await reopened.locator('#continue').click(); const actual = await view(reopened);
      if (!malformedOnly) sameView(actual, expected);
      expect(actual.scale).toBeGreaterThan(0); expect(Number.isFinite(actual.scale)).toBe(true);
      expect((await saved(reopened)).surveys[0].plans[0].walls).toEqual(fixture.surveys[0].plans[0].walls); expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test('viewport independent wall recovery preserves an existing saved transform', async ({ page, browser }) => {
  await seed(page); await settle(page); await page.locator('#zoomIn').click(); await pan(page);
  const expected = await view(page), full = await saved(page), incomplete = structuredClone(full);
  incomplete.surveys[0].plans[0].walls = incomplete.surveys[0].plans[0].walls.slice(0, 2);
  await page.evaluate(walls => localStorage.setItem('fsp-test-isolated-blue-walls-v1751-survey-1-plan-1', JSON.stringify({ walls })), full.surveys[0].plans[0].walls);
  const context = await reopenCopies(page, browser, { idb: incomplete, mirror: incomplete });
  try {
    const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click(); sameView(await view(reopened), expected);
    expect((await saved(reopened)).surveys[0].plans[0].walls).toEqual(full.surveys[0].plans[0].walls);
  } finally { await context.close(); }
});

for (const backend of ['indexedDB', 'mirror']) {
  test(`viewport reopens from ${backend} alone with legacy viewport metadata preserved`, async ({ page, browser }) => {
    await seed(page); await settle(page); await page.locator('#zoomIn').click(); await pan(page);
    const expected = await view(page), data = await saved(page);
    data.surveys[0].plans[0].viewState.futureMetadata = { keep: true };
    const context = await reopenCopies(page, browser, backend === 'indexedDB' ? { idb: data } : { mirror: data });
    try {
      const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click(); sameView(await view(reopened), expected);
      expect((await saved(reopened)).surveys[0].plans[0].viewState.futureMetadata).toEqual({ keep: true });
    } finally { await context.close(); }
  });
}

test('viewport restores the last selected floor when IndexedDB still points to a previous floor', async ({ page, browser }) => {
  await seed(page); await settle(page); await page.locator('#zoomIn').click(); const first = await saved(page);
  await page.locator('#planSelect').selectOption('plan-2'); await settle(page); await page.locator('#zoomOut').click(); await pan(page);
  const second = await saved(page), expected = await view(page);
  const context = await reopenCopies(page, browser, { idb: first, mirror: second });
  try {
    const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click();
    await expect(reopened.locator('#planSelect')).toHaveValue('plan-2'); sameView(await view(reopened), expected);
    await reopened.locator('#planSelect').selectOption('plan-1'); await settle(reopened);
    const data = await saved(reopened);
    expect(data.surveys[0].plans[0].viewState.unitsPerPixel).toBeCloseTo(first.surveys[0].plans[0].viewState.unitsPerPixel, 5);
    expect(data.surveys[0].plans[0].walls).toEqual(first.surveys[0].plans[0].walls);
  } finally { await context.close(); }
});

test('viewport startup background event cannot overwrite unreconciled storage', async ({ page, browser }) => {
  await seed(page); await settle(page); await page.locator('#zoomIn').click(); await pan(page);
  const expected = await view(page), data = await saved(page);
  const context = await browser.newContext({ storageState: await page.context().storageState({ indexedDB: true }) });
  try {
    await context.addInitScript(() => {
      const descriptor = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess');
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args) {
        const request = open.apply(this, args);
        Object.defineProperty(request, 'onsuccess', { set(fn) { descriptor.set.call(request, e => setTimeout(() => fn(e), 1000)); } });
        return request;
      };
    });
    const reopened = await context.newPage(); await reopened.goto(TARGET);
    await expect(reopened.locator('#continue')).toBeHidden();
    await reopened.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
    expect(await reopened.evaluate(key => JSON.parse(localStorage.getItem(key)), MIRROR)).toEqual(data);
    await reopened.locator('#continue').click(); sameView(await view(reopened), expected);
    expect((await saved(reopened)).surveys[0].plans[0].walls).toEqual(data.surveys[0].plans[0].walls);
  } finally { await context.close(); }
});


for (const mode of ['camera', 'pending drawing']) {
  test(`viewport deferred resize is restored after a ${mode} press without movement`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 }); await seed(page); await settle(page);
    const canvas = mode === 'camera' ? 'surveyCanvas' : 'planCanvas';
    if (mode === 'camera') await page.locator('#toSurvey').click();
    else { await page.locator('#editPlan').click(); await page.locator('#line').click(); }
    const before = await view(page, canvas), data = unrelated(await saved(page));
    const point = await page.locator('#' + canvas).evaluate((svg, mode) => {
      if (mode === 'camera') { const q = new DOMPoint(350, 350).matrixTransform(svg.querySelector('g').getScreenCTM()); return { x: q.x, y: q.y }; }
      const r = svg.getBoundingClientRect(); return { x: r.left + r.width * .3, y: r.top + r.height * .3 };
    }, mode);
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.setViewportSize({ width: 412, height: 875 }); await page.mouse.up();
    sameView(await view(page, canvas), before);
    expect(unrelated(await saved(page))).toEqual(data);
  });
}
