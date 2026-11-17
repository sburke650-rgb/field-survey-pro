const { test, expect, chromium } = require('@playwright/test');
const { seed, saved, fixture, drag, KEY, TARGET, cameraMode } = require('./helpers/app');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const errors = new WeakMap();
test.beforeEach(async ({ page }) => { const list = []; errors.set(page, list); page.on('pageerror', e => list.push(e.message)); });
test.afterEach(async ({ page }) => { expect(errors.get(page) || []).toEqual([]); });
const portrait = { width: 412, height: 915 }, landscape = { width: 915, height: 412 };
async function settle(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
}
async function pose(page, id = 'planCanvas') {
  await settle(page);
  return page.locator('#' + id).evaluate(svg => {
    const r = svg.getBoundingClientRect(), m = svg.querySelector('g').getScreenCTM();
    const c = new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(m.inverse());
    return { x: c.x, y: c.y, scale: Math.hypot(m.a, m.b), angle: Math.atan2(m.b, m.a) };
  });
}
function sameCenter(a, b) {
  expect(Math.abs(a.x - b.x) * a.scale).toBeLessThan(.5);
  expect(Math.abs(a.y - b.y) * a.scale).toBeLessThan(.5);
  expect(a.scale).toBeCloseTo(b.scale, 5);
}
async function pan(page, id = 'planCanvas', dx = 57, dy = 31) {
  const r = await page.locator('#' + id).boundingBox();
  await drag(page, { x: r.x + r.width * .45, y: r.y + r.height * .45 },
    { x: r.x + r.width * .45 + dx, y: r.y + r.height * .45 + dy });
  await settle(page);
}
function automaticState() {
  const s = structuredClone(fixture); s.surveys[0].plans[0].viewRotationOverride = null; return s;
}
for (const canvas of ['planCanvas', 'surveyCanvas']) for (const zoom of [0, 2, 5]) {
  test(`rotation center ${canvas}: four quarter turns after pan at zoom ${zoom}`, async ({ page }) => {
    await page.setViewportSize(portrait); await seed(page);
    for (let i = 0; i < zoom; i++) await page.locator('#zoomIn').click();
    await pan(page);
    if (canvas === 'surveyCanvas') { await cameraMode(page); await pan(page, canvas, -43, 25); }
    const start = await pose(page, canvas), geometry = (await saved(page)).surveys[0].plans[0];
    for (let i = 0; i < 4; i++) {
      await page.locator(canvas === 'planCanvas' ? '#rotatePlanView' : '#rotateSurveyView').click();
      sameCenter(await pose(page, canvas), start);
    }
    expect((await pose(page, canvas)).angle).toBeCloseTo(start.angle, 5);
    const after = (await saved(page)).surveys[0].plans[0];
    for (const key of ['walls','cameras','dimensions','fspRoutes','fspRacks']) expect(after[key]).toEqual(geometry[key]);
  });
}
test('automatic orientation preserves center and independent portrait/landscape pan and zoom', async ({ page }) => {
  await page.setViewportSize(portrait); await seed(page, { state: automaticState() });
  await page.locator('#zoomIn').click(); await pan(page); const p = await pose(page);
  await page.setViewportSize(landscape); sameCenter(await pose(page), p);
  expect(Math.abs((await pose(page)).angle - p.angle)).toBeCloseTo(Math.PI / 2, 5);
  await page.locator('#zoomOut').click(); await pan(page, 'planCanvas', -71, 29); const l = await pose(page);
  for (let i = 0; i < 3; i++) {
    await page.setViewportSize(portrait); sameCenter(await pose(page), p);
    await page.setViewportSize(landscape); sameCenter(await pose(page), l);
  }
  await saved(page); await page.reload(); await page.locator('#continue').click(); sameCenter(await pose(page), l);
  await page.setViewportSize(portrait); sameCenter(await pose(page), p);
});
async function screenPose(page, id = 'planCanvas') {
  return page.locator('#' + id).evaluate(svg => {
    const m = svg.querySelector('g').getScreenCTM();
    return [m.a, m.b, m.c, m.d, m.e, m.f];
  });
}
function sameScreen(a, b) { a.forEach((n, i) => expect(Math.abs(n - b[i])).toBeLessThan(i < 4 ? 1e-5 : .1)); }
test('independent views survive Edit/Done, camera screen and plan transitions without changing screen anchors', async ({ page }) => {
  await page.setViewportSize(portrait); await seed(page, { state: automaticState() });
  await pan(page); const p = await pose(page);
  await page.setViewportSize(landscape); await page.locator('#zoomOut').click(); await pan(page); const l = await pose(page);
  for (const size of [portrait, landscape]) {
    await page.setViewportSize(size); const expected = size === portrait ? p : l;
    sameCenter(await pose(page), expected); const screen = await screenPose(page);
    await page.locator('#editPlan').click(); await settle(page); sameScreen(await screenPose(page), screen);
    await page.locator('#finishEdit').click(); await settle(page); sameScreen(await screenPose(page), screen);
    await cameraMode(page); sameScreen(await screenPose(page, 'surveyCanvas'), screen);
    await page.locator('#surveyDone').click(); await settle(page); sameScreen(await screenPose(page), screen);
    await page.locator('#planSelect').selectOption('plan-2'); await settle(page);
    await page.locator('#planSelect').selectOption('plan-1'); sameScreen(await screenPose(page), screen);
  }
});
test('late orientation sizes and duplicate events retain one center until explicit navigation', async ({ page }) => {
  await page.setViewportSize(portrait); await seed(page, { state: automaticState() });
  await page.locator('#zoomIn').click(); await pan(page); const before = await pose(page);
  for (const size of [{ width: 840, height: 450 }, landscape, { width: 915, height: 385 }, landscape]) {
    await page.setViewportSize(size);
    await page.evaluate(() => { dispatchEvent(new Event('orientationchange')); dispatchEvent(new Event('resize')); dispatchEvent(new Event('fsp-viewport-change')); });
    sameCenter(await pose(page), before);
  }
  await pan(page); const moved = await pose(page);
  expect(Math.abs(moved.x - before.x) + Math.abs(moved.y - before.y)).toBeGreaterThan(1);
  await page.setViewportSize(portrait); sameCenter(await pose(page), before);
  await page.setViewportSize(landscape); sameCenter(await pose(page), moved);
});
for (const version of [1, 2]) test(`legacy v${version} portrait migration preserves zoom, screen anchor and unknown fields`, async ({ browser, baseURL }) => {
  const old = await browser.newContext({ baseURL, viewport: portrait }), repaired = await browser.newContext({ baseURL, viewport: portrait });
  try {
    const original = await old.newPage(); await seed(original, { target: '/test/v17-130/' });
    await original.locator('#zoomIn').click(); await original.locator('#zoomIn').click(); await pan(original);
    const expected = await screenPose(original), state = await saved(original), v = state.surveys[0].plans[0].viewState;
    v.futureField = { retained: true };
    if (version === 1) { for (const k of ['originX','originY','pivotX','pivotY','updatedAt']) delete v[k]; v.version = 1; }
    const page = await repaired.newPage(); await seed(page, { state });
    sameScreen(await screenPose(page), expected);
    const migrated = (await saved(page)).surveys[0].plans[0];
    expect(migrated.orientationViews.version).toBe(1);
    expect(migrated.orientationViews.portrait.unitsPerPixel).toBe(v.unitsPerPixel);
    expect(migrated.orientationViews.portrait.futureField).toEqual(v.futureField);
    await page.setViewportSize(landscape); await page.locator('#zoomOut').click(); await pan(page);
    await page.setViewportSize(portrait); sameScreen(await screenPose(page), expected);
  } finally { await old.close(); await repaired.close(); }
});
for (const reopenedSize of [portrait, landscape]) test(`independent orientation views survive actual browser restart into ${reopenedSize.width}`, async ({ baseURL }) => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-orientations-'));
  const options = { baseURL, headless: true, viewport: portrait, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH };
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, options);
    let page = await context.newPage(); await seed(page, { state: automaticState() });
    await page.locator('#zoomIn').click(); await pan(page); const p = await pose(page);
    await page.setViewportSize(landscape); await page.locator('#zoomOut').click(); await pan(page); const l = await pose(page);
    const data = await saved(page);
    await context.close(); context = null;
    context = await chromium.launchPersistentContext(profile, { ...options, viewport: reopenedSize });
    page = await context.newPage(); await page.goto(TARGET); await page.locator('#continue').click();
    sameCenter(await pose(page), reopenedSize === portrait ? p : l);
    await page.setViewportSize(portrait); sameCenter(await pose(page), p);
    await page.setViewportSize(landscape); sameCenter(await pose(page), l);
    const after = (await saved(page)).surveys[0].plans[0];
    for (const k of ['walls','cameras','dimensions','fspRacks','fspRoutes']) expect(after[k]).toEqual(data.surveys[0].plans[0][k]);
  } finally { if (context) await context.close(); await fs.rm(profile, { recursive: true, force: true }); }
});
for (const angle of [0, 90, 180, 270]) test(`camera and drawing coordinates align after rotation ${angle}`, async ({ page }) => {
  await page.setViewportSize(portrait);
  const state = structuredClone(fixture), model = state.surveys[0].plans[0];
  model.viewRotationOverride = angle; await seed(page, { state }); await cameraMode(page);
  const point = (id, x, y) => page.locator('#' + id).evaluate((svg, p) => {
    const q = new DOMPoint(p.x, p.y).matrixTransform(svg.querySelector('g').getScreenCTM()); return { x: q.x, y: q.y };
  }, { x, y });
  const before = await screenPose(page, 'surveyCanvas');
  await drag(page, await point('surveyCanvas', 350, 350), await point('surveyCanvas', 400, 380));
  let p = (await saved(page)).surveys[0].plans[0];
  expect(p.cameras[0].x).toBeCloseTo(400, 1); expect(p.cameras[0].y).toBeCloseTo(380, 1);
  sameScreen(await screenPose(page, 'surveyCanvas'), before);
  expect(p.fspRoutes[0].points[0]).toEqual({ x: p.cameras[0].x, y: p.cameras[0].y });
  await page.locator('#surveyDone').click(); await page.locator('#editPlan').click(); await settle(page); await page.locator('#line').click();
  const from = { x: 300, y: 200 }, to = { x: 420, y: 210 }, walls = p.walls.length;
  const anchor = await screenPose(page);
  await drag(page, await point('planCanvas', from.x, from.y), await point('planCanvas', to.x, to.y));
  p = (await saved(page)).surveys[0].plans[0]; expect(p.walls).toHaveLength(walls + 1);
  const points = p.walls.at(-1).points;
  expect(points[0].x).toBeCloseTo(from.x, 1); expect(points[0].y).toBeCloseTo(from.y, 1);
  expect(points.at(-1).x).toBeCloseTo(to.x, 1); expect(points.at(-1).y).toBeCloseTo(to.y, 1);
  sameScreen(await screenPose(page), anchor);
});
async function orientationPair(page) {
  await page.setViewportSize(portrait); await seed(page, { state: automaticState() });
  await page.locator('#zoomIn').click(); await pan(page); const p = await pose(page);
  await page.setViewportSize(landscape); await page.locator('#zoomOut').click(); await pan(page, 'planCanvas', -55, 20); const l = await pose(page);
  await page.setViewportSize(portrait); await settle(page);
  return { p, l, state: await saved(page) };
}
async function reopenCopies(page, browser, copies) {
  await page.evaluate(async ({ copies, key }) => {
    const mirror = key + '-full-mirror-v1748';
    if (copies.mirror) localStorage.setItem(mirror, JSON.stringify(copies.mirror)); else localStorage.removeItem(mirror);
    if (copies.legacy) localStorage.setItem(key, JSON.stringify(copies.legacy)); else localStorage.removeItem(key);
    const db = await new Promise(resolve => { const r = indexedDB.open('fsp-test-isolated-v1', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise(resolve => { const t = db.transaction('state', 'readwrite');
      if (copies.idb) t.objectStore('state').put(copies.idb, key); else t.objectStore('state').delete(key); t.oncomplete = resolve; }); db.close();
  }, { copies, key: KEY });
  return browser.newContext({ storageState: await page.context().storageState({ indexedDB: true }), viewport: portrait });
}
for (const backend of ['mirror', 'idb', 'legacy']) test(`reconcile independently freshest orientation records from ${backend}`, async ({ page, browser }) => {
  const { p, l, state } = await orientationPair(page), a = structuredClone(state), b = structuredClone(state);
  const ap = a.surveys[0].plans[0], bp = b.surveys[0].plans[0], time = Date.now() + 10000;
  ap.viewState.updatedAt = time + 2; ap.orientationViews.portrait.updatedAt = time + 2;
  // The globally newer active view is portrait in A, while B has newer landscape.
  bp.viewState.updatedAt = time + 1; bp.orientationViews.landscape.updatedAt = time + 3;
  ap.orientationViews.landscape.cx += 100; ap.orientationViews.landscape.originX += 100;
  bp.orientationViews.portrait.cx += 100; bp.orientationViews.portrait.originX += 100;
  bp.orientationViews.portrait.updatedAt = 1;
  const copies = { mirror: a, idb: a, legacy: a, [backend]: b };
  const context = await reopenCopies(page, browser, copies);
  try {
    const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click();
    sameCenter(await pose(reopened), p);
    await reopened.setViewportSize(landscape); sameCenter(await pose(reopened), l);
    const merged = (await saved(reopened)).surveys[0].plans[0];
    expect(merged.walls).toEqual(ap.walls); expect(merged.fspRoutes).toEqual(ap.fspRoutes);
  } finally { await context.close(); }
});
for (const broken of ['active view', 'landscape record']) test(`malformed ${broken} retains other valid orientation state`, async ({ page, browser }) => {
  const { p, l, state } = await orientationPair(page), model = state.surveys[0].plans[0];
  if (broken === 'active view') model.viewState.unitsPerPixel = 0;
  else model.orientationViews.landscape.unitsPerPixel = 0;
  const context = await reopenCopies(page, browser, { mirror: state, idb: state });
  try {
    const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click();
    sameCenter(await pose(reopened), p);
    await reopened.setViewportSize(landscape); sameCenter(await pose(reopened), broken === 'active view' ? l : p);
    await reopened.setViewportSize(portrait); sameCenter(await pose(reopened), p);
  } finally { await context.close(); }
});
test('orientation views export/import and offline edits retain both positions and geometry', async ({ page, context }) => {
  const { p, l, state } = await orientationPair(page);
  await context.setOffline(true);
  await page.setViewportSize(landscape); sameCenter(await pose(page), l);
  await cameraMode(page); await pan(page, 'surveyCanvas', 29, 17); const offline = await pose(page, 'surveyCanvas');
  await page.locator('#surveyDone').click(); await settle(page);
  await page.setViewportSize(portrait); sameCenter(await pose(page), p);
  await context.setOffline(false);
  await page.locator('#plans header [data-go="home"]').click(); await page.locator('#allSurveys').click();
  const download = page.waitForEvent('download'); await page.locator('#exportBackup').click();
  const stream = await (await download).createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks), exported = JSON.parse(buffer.toString());
  expect(exported.surveys[0].plans[0].orientationViews.version).toBe(1);
  await page.locator('#backupFile').setInputFiles({ name: 'synthetic-orientations.json', mimeType: 'application/json', buffer });
  await page.locator('#modalOk').click(); await page.locator('[data-open="survey-1"]').click();
  sameCenter(await pose(page), p);
  await page.setViewportSize(landscape);
  // Camera screen and Plans share client anchoring; compare the saved plan-space center from the exported record.
  const v = exported.surveys[0].plans[0].orientationViews.landscape;
  const expected = await page.locator('#planScene').evaluate((scene, v) => {
    const inverse = new DOMMatrix().rotate(v.rotation).inverse();
    const q = new DOMPoint(v.cx-v.pivotX,v.cy-v.pivotY).matrixTransform(inverse);
    return { x: q.x+v.pivotX, y: q.y+v.pivotY, scale: 1/v.unitsPerPixel };
  }, v);
  sameCenter(await pose(page), expected);
  expect(Math.abs(offline.x-l.x)+Math.abs(offline.y-l.y)).toBeGreaterThan(1);
  const after = (await saved(page)).surveys[0].plans[0];
  for (const k of ['walls','cameras','dimensions','fspRacks','fspRoutes']) expect(after[k]).toEqual(state.surveys[0].plans[0][k]);
});
test('touch pinch has independent scales in both orientations and interrupted navigation restores safely', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: portrait, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(), pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
    await seed(page, { state: automaticState() }); await settle(page);
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x,y],id) => ({ x,y,id })) });
    async function pinch() {
      const r = await page.locator('#planCanvas').boundingBox(), x = r.x+r.width*.5, y = r.y+r.height*.4;
      await touch('touchStart', [[x-20,y],[x+20,y]]);
      for (let d=25;d<=45;d+=5) await touch('touchMove', [[x-d,y],[x+d,y]]);
      await touch('touchEnd', []); await settle(page);
    }
    const initial = await pose(page); await pinch(); const p = await pose(page); expect(p.scale).toBeGreaterThan(initial.scale*1.5);
    await page.setViewportSize(landscape); sameCenter(await pose(page), p);
    await pinch(); const l = await pose(page); expect(l.scale).toBeGreaterThan(p.scale*1.5);
    const r = await page.locator('#planCanvas').boundingBox();
    await touch('touchStart', [[r.x+r.width*.4,r.y+r.height*.4]]);
    await page.setViewportSize(portrait); await touch('touchCancel', []); sameCenter(await pose(page), p);
    await page.setViewportSize(landscape); sameCenter(await pose(page), l);
    expect(pageErrors).toEqual([]);
  } finally { await context.close(); }
});
for (const imageWidth of [1400, 500]) test(`uploaded ${imageWidth}px plan retains center through rotations and orientation changes`, async ({ page }) => {
  await page.setViewportSize(portrait); const state = automaticState(), model = state.surveys[0].plans[0];
  model.image = 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="700"><rect width="100%" height="100%" fill="white"/></svg>`).toString('base64');
  model.imageWidth = imageWidth; model.imageHeight = 700;
  await seed(page, { state }); await page.locator('#zoomIn').click(); await pan(page); const start = await pose(page);
  for (let i=0;i<4;i++) { await page.locator('#rotatePlanView').click(); sameCenter(await pose(page), start); }
  await page.setViewportSize(landscape); sameCenter(await pose(page), start);
  await page.setViewportSize(portrait); sameCenter(await pose(page), start);
  expect((await saved(page)).surveys[0].plans[0].image).toBe(model.image);
});
test('manual override changes reproject the opposite saved orientation without losing its center or scale', async ({ page }) => {
  const { p, l } = await orientationPair(page);
  for(let i=0;i<4;i++) {
    await page.setViewportSize(landscape); await page.locator('#rotatePlanView').click(); sameCenter(await pose(page), l);
    await page.setViewportSize(portrait); sameCenter(await pose(page), p);
  }
});
test('explicit Fit ends a pending orientation anchor and remains stable on later resize events', async ({ page }) => {
  await page.setViewportSize(portrait); await seed(page, { state: automaticState() });
  await page.locator('#zoomIn').click(); await pan(page);
  await page.setViewportSize(landscape); await settle(page);
  await page.locator('#fitPlan').evaluate(button => button.click()); await settle(page); const fitted = await screenPose(page);
  await page.evaluate(() => { dispatchEvent(new Event('resize')); dispatchEvent(new Event('fsp-viewport-change')); });
  await settle(page); sameScreen(await screenPose(page), fitted);
});
test('editing a future-dated orientation record advances its own clock before reconciliation', async ({ page, browser }) => {
  const { state } = await orientationPair(page), model = state.surveys[0].plans[0];
  model.orientationViews.landscape.updatedAt = Date.now() + 1000000;
  const context = await reopenCopies(page, browser, { mirror: state, idb: state });
  try {
    const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click();
    await reopened.setViewportSize(landscape); await pan(reopened); const edited = await pose(reopened);
    const next = await saved(reopened);
    expect(next.surveys[0].plans[0].orientationViews.landscape.updatedAt).toBeGreaterThan(model.orientationViews.landscape.updatedAt);
    // Reintroduce a stale backend with the original future-dated record.
    const recovered = await reopenCopies(reopened, browser, { mirror: next, idb: state });
    try {
      const last = await recovered.newPage(); await last.goto(TARGET); await last.locator('#continue').click();
      await last.setViewportSize(landscape); sameCenter(await pose(last), edited);
    } finally { await recovered.close(); }
  } finally { await context.close(); }
});
test('reconciled records with an older pivot still restore the same original-plan center', async ({ page, browser }) => {
  const { l, state } = await orientationPair(page), v = state.surveys[0].plans[0].orientationViews.landscape;
  const oldX = v.cx, oldY = v.cy, angle = v.rotation*Math.PI/180;
  v.pivotX = 110; v.pivotY = 210;
  v.cx = v.pivotX+(l.x-v.pivotX)*Math.cos(angle)-(l.y-v.pivotY)*Math.sin(angle);
  v.cy = v.pivotY+(l.x-v.pivotX)*Math.sin(angle)+(l.y-v.pivotY)*Math.cos(angle);
  v.originX += v.cx-oldX; v.originY += v.cy-oldY;
  const context = await reopenCopies(page, browser, { mirror: state });
  try {
    const reopened = await context.newPage(); await reopened.goto(TARGET); await reopened.locator('#continue').click();
    await reopened.setViewportSize(landscape); sameCenter(await pose(reopened), l);
  } finally { await context.close(); }
});
