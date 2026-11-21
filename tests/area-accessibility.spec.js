const { test, expect } = require('@playwright/test');
const { seed, saved, fixture } = require('./helpers/app');
const image = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="white"/></svg>').toString('base64');
function stateFor(uploaded) {
  const state = structuredClone(fixture), p = state.surveys[0].plans[0];
  if (uploaded) {
    Object.assign(p, { image, imageWidth: 1000, imageHeight: 700 });
    p.areas = [{ id: 'uploaded-area', kind: 'auto-uploaded-rectangle', name: 'Building Area', sqft: 5000, pos: { x: 500, y: 350 }, group: '' }];
  }
  return state;
}
async function enter(page, uploaded = false) {
  await seed(page, { state: stateFor(uploaded) }); await page.locator('#editPlan').click();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
async function point(page, x, y) {
  return page.locator('#planCanvas').evaluate((svg, v) => {
    const p = svg.createSVGPoint(); p.x = v.x; p.y = v.y;
    const q = p.matrixTransform(document.querySelector('#planScene').getScreenCTM()); return { x: q.x, y: q.y };
  }, { x, y });
}
async function tapCorner(page, x, y, touch = false) {
  const p = await point(page, x, y);
  if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
async function beginTrace(page, touch = false) {
  await expect(page.locator('#areaTool')).toBeVisible();
  await page.locator('#areaTool')[touch ? 'tap' : 'click']();
  await page.getByRole('button', { name: 'Trace irregular outline', exact: true })[touch ? 'tap' : 'click']();
  await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'area-trace');
}
const lShape = [[200, 200], [600, 200], [600, 300], [400, 300], [400, 500], [200, 500]];
for (const uploaded of [false, true]) {
  test(`Area control is reachable on ${uploaded ? 'uploaded' : 'drawn'} Edit entry without selecting a drawing tool`, async ({ page }) => {
    await enter(page, uploaded);
    await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
    await expect(page.locator('#areaTool')).toBeVisible();
    await expect(page.locator('#areaTool')).not.toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#line')).not.toHaveClass(/\bprimary\b/);
    await page.locator('#areaTool').click();
    await expect(page.getByRole('button', { name: 'Trace irregular outline', exact: true })).toBeVisible();
  });
}

for (const uploaded of [false, true]) {
  test(`${uploaded ? 'uploaded' : 'drawn'} L trace completes, saves structured points and reopens`, async ({ page }) => {
    await enter(page, uploaded); const before = (await saved(page)).surveys[0].plans[0];
    await beginTrace(page);
    for (const v of lShape) await tapCorner(page, ...v);
    await expect(page.locator('#areaTool')).toHaveText('Finish Area');
    await page.locator('#finishEdit').click();
    await expect(page.locator('#modalTitle')).toHaveText('Save Traced Area');
    await page.locator('#traceName').fill('Synthetic L area'); await page.locator('#traceGroup').fill('Building');
    await page.locator('#modalOk').click();
    await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
    const after = (await saved(page)).surveys[0].plans[0], trace = after.areas.find(a => a.kind === 'trace');
    expect(trace).toMatchObject({ name: 'Synthetic L area', group: 'Building', kind: 'trace' });
    expect(trace.points).toHaveLength(lShape.length);
    trace.points.forEach((p, i) => { expect(p.x).toBeCloseTo(lShape[i][0], 3); expect(p.y).toBeCloseTo(lShape[i][1], 3); });
    await expect(page.locator(`[data-area-label="${trace.id}"]`).first()).toContainText('1,000 sq ft');
    expect(after.walls).toEqual(before.walls); expect(after.dimensions).toEqual(before.dimensions); expect(after.image).toBe(before.image);
    expect(after.cameras).toEqual(before.cameras); expect(after.fspRoutes).toEqual(before.fspRoutes);
    await page.locator('#finishEdit').click(); await page.reload(); await page.locator('#continue').click();
    expect((await saved(page)).surveys[0].plans[0].areas.find(a => a.id === trace.id)).toEqual(trace);
    await expect(page.locator(`[data-area-label="${trace.id}"]`).first()).toContainText('1,000 sq ft');
  });
}

test('Undo changes only draft corners and Back cancels Area without leaving the editor', async ({ page }) => {
  await enter(page); const before = (await saved(page)).surveys[0].plans[0]; await beginTrace(page);
  await expect(page.locator('#undo')).toBeDisabled();
  await tapCorner(page, 200, 200); await tapCorner(page, 600, 200);
  await expect(page.locator('#undo')).toHaveText('Undo Corner'); await page.locator('#undo').click();
  await expect(page.locator('#planScene circle[data-trace-preview]')).toHaveCount(1);
  await page.locator('#plans header [data-go="home"]').click();
  await expect(page.locator('#plans')).toBeVisible(); await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
  await expect(page.locator('[data-trace-preview]')).toHaveCount(0); await expect(page.locator('#undo')).toHaveText('Undo');
  const after = (await saved(page)).surveys[0].plans[0];
  expect(after.walls).toEqual(before.walls); expect(after.dimensions).toEqual(before.dimensions); expect(after.areas).toEqual(before.areas);
});

test('cancelling the save dialog retains existing areas and clears the draft preview', async ({ page }) => {
  await enter(page, true); const before = (await saved(page)).surveys[0].plans[0]; await beginTrace(page);
  for (const v of lShape) await tapCorner(page, ...v);
  await page.locator('#areaTool').click(); await expect(page.locator('#modalTitle')).toHaveText('Save Traced Area');
  await page.locator('#modalCancel').click();
  await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
  await expect(page.locator('[data-trace-preview]')).toHaveCount(0);
  const after = (await saved(page)).surveys[0].plans[0];
  expect(after.areas).toEqual(before.areas); expect(after.walls).toEqual(before.walls); expect(after.dimensions).toEqual(before.dimensions);
});

test('short traces stay editable; cancelling and changing tools never commit walls or areas', async ({ page }) => {
  await enter(page); const before = (await saved(page)).surveys[0].plans[0];
  await beginTrace(page); await tapCorner(page, 200, 200);
  page.once('dialog', d => d.accept()); await page.locator('#finishEdit').click();
  await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'area-trace');
  await page.keyboard.press('Escape');
  await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
  for (const id of ['line', 'free', 'measureWall']) {
    await beginTrace(page); await tapCorner(page, 200, 200); await page.locator('#' + id).click();
    await expect(page.locator('[data-trace-preview]')).toHaveCount(0);
    await expect(page.locator('#areaTool')).not.toHaveClass(/\bprimary\b/);
  }
  await page.locator('#areaTool').click(); await page.locator('#modalOk').click();
  await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
  const after = (await saved(page)).surveys[0].plans[0];
  for (const k of ['walls', 'dimensions', 'areas']) expect(after[k]).toEqual(before[k]);
});

test('Area requires independent calibration and leaves neutral navigation usable', async ({ page }) => {
  const state = stateFor(true); state.surveys[0].plans[0].dimensions = [];
  await seed(page, { state }); await page.locator('#editPlan').click();
  await page.locator('#areaTool').click();
  let message; page.once('dialog', async d => { message = d.message(); await d.accept(); });
  await page.getByRole('button', { name: 'Trace irregular outline', exact: true }).click();
  expect(message).toContain('horizontal and one vertical');
  await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
  await expect(page.locator('[data-trace-preview]')).toHaveCount(0);
});

for (const uploaded of [false, true]) {
  test(`${uploaded ? 'uploaded' : 'drawn'} existing rectangle and manual L workflows are accessible and persist`, async ({ page }) => {
    await enter(page, uploaded);
    await page.locator('#areaTool').click(); await page.getByRole('button', { name: 'Rectangle from measurements', exact: true }).click();
    await page.locator('#areaLength').selectOption('d:dim-x');
    await page.locator('#areaWidth').selectOption('d:dim-y');
    await page.locator('#modalOk').click();
    let p = (await saved(page)).surveys[0].plans[0];
    expect(p.areas.some(a => a.kind === 'rectangle' && a.lengthId === 'd:dim-x' && a.widthId === 'd:dim-y')).toBe(true);
    await page.locator('#areaTool').click(); await page.getByRole('button', { name: 'Enter dimensions', exact: true }).click();
    await page.getByRole('button', { name: 'L-shaped', exact: true }).click();
    for (const [id, value] of Object.entries({ manualWidth: '100', manualHeight: '60', manualCutWidth: '40', manualCutHeight: '20' })) await page.locator('#' + id).fill(value);
    await page.locator('#modalOk').click(); p = (await saved(page)).surveys[0].plans[0];
    const area = p.areas.find(a => a.kind === 'manual-l'); expect(area).toMatchObject({ width: 100, height: 60, cutWidth: 40, cutHeight: 20 });
    await expect(page.locator(`[data-area-label="${area.id}"]`).first()).toContainText('5,200 sq ft');
    await page.reload(); await page.locator('#continue').click();
    expect((await saved(page)).surveys[0].plans[0].areas).toEqual(p.areas);
  });
}

for (const uploaded of [false, true]) {
  test(`${uploaded ? 'uploaded' : 'drawn'} simulated touch Area supports portrait, landscape, cancel and saved reopening`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      await seed(page, { state: stateFor(uploaded), target: baseURL + '/development/' }); await page.locator('#editPlan').tap();
      await beginTrace(page, true); await tapCorner(page, 200, 200, true);
      await page.locator('#plans header [data-go="home"]').tap();
      await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
      await page.setViewportSize({ width: 844, height: 390 });
      // Orientation now preserves zoom rather than implicitly fitting. Explicitly
      // fit this fixed-coordinate tracing fixture; keep every trace assertion.
      await page.locator('#fitPlan').evaluate(button => button.click());
      // V17.128 overlays a fixed toolbar on the canvas. Place the full polygon
      // above that toolbar so coordinate taps exercise drawing rather than UI.
      await page.locator('#planCanvas').evaluate(svg=>{
        const b=svg.getAttribute('viewBox').split(/\s+/).map(Number),r=svg.getBoundingClientRect();
        const scale=Math.max(b[2]/r.width,b[3]/r.height)*2;
        const cx=b[0]+b[2]/2,cy=b[1]+b[3]/2;
        svg.setAttribute('viewBox',[cx-r.width*scale/2,cy-(170-r.top)*scale,r.width*scale,r.height*scale].join(' '));
        // Commit fixture transform through the normal zoom controller.
        document.getElementById('zoomOut').click();
      });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await beginTrace(page, true);
      for (const v of lShape) await tapCorner(page, ...v, true);
      await expect(page.locator('#planScene circle[data-trace-preview]')).toHaveCount(6);
      await page.locator('#finishEdit').tap(); await page.locator('#traceName').fill('Touch L');
      await page.locator('#modalOk').tap();
      const area = (await saved(page)).surveys[0].plans[0].areas.find(a => a.kind === 'trace');
      expect(area.points).toHaveLength(6); expect(area.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      // Touch events round screen positions; compare the calculated result to the actual stored polygon.
      const twice = Math.abs(area.points.reduce((n, p, i, pts) => { const q = pts[(i + 1) % pts.length]; return n + p.x * q.y - q.x * p.y; }, 0));
      expect(twice / 2 * .125 * .1).toBeCloseTo(1000, -1);
      await page.reload(); await page.locator('#continue').tap();
      expect((await saved(page)).surveys[0].plans[0].areas.find(a => a.id === area.id)).toEqual(area);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test('navigation, measurement hits and plan switching cannot mutate traced or existing geometry', async ({ page }) => {
  await enter(page, true); const before = (await saved(page)).surveys[0].plans[0]; await beginTrace(page);
  await tapCorner(page, 200, 200);
  const from = await point(page, 300, 250), to = await point(page, 350, 280);
  const box = await page.locator('#planCanvas').getAttribute('viewBox');
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('#planScene circle[data-trace-preview]')).toHaveCount(1);
  expect(await page.locator('#planCanvas').getAttribute('viewBox')).not.toBe(box);
  // Hit an actual measurement line and existing area label while tracing: no measurement/label editor.
  await tapCorner(page, 400, 100); await tapCorner(page, 500, 350);
  await expect(page.locator('#modalBack')).toBeHidden();
  await expect(page.locator('#planScene circle[data-trace-preview]')).toHaveCount(3);
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator('#planScene circle[data-trace-preview]')).toHaveCount(3);
  await page.locator('#plans header [data-go="home"]').click();
  await page.locator('#finishEdit').click();
  const second = fixture.surveys[0].plans[1].id;
  await page.locator('#planSelect').selectOption(second);
  await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
  await expect(page.locator('[data-trace-preview]')).toHaveCount(0);
  await page.locator('#planSelect').selectOption(before.id);
  const after = (await saved(page)).surveys[0].plans[0];
  for (const k of ['walls', 'dimensions', 'areas', 'cameras', 'fspRoutes']) expect(after[k]).toEqual(before[k]);
});

test('multi-touch navigation adds no corners or walls in Area mode', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, viewport: { width: 1100, height: 850 } });
  const page = await context.newPage();
  try {
    await enter(page, true); const before = (await saved(page)).surveys[0].plans[0]; await beginTrace(page, true);
    await tapCorner(page, 200, 200, true);
    const cdp = await context.newCDPSession(page), a = await point(page, 300, 250), b = await point(page, 600, 450);
    const touch = (id, p) => ({ id, x: p.x, y: p.y });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, a)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, a), touch(2, b)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, { x: a.x - 20, y: a.y }), touch(2, { x: b.x + 20, y: b.y })] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#planScene circle[data-trace-preview]')).toHaveCount(1);
    await page.locator('#plans header [data-go="home"]').tap();
    const after = (await saved(page)).surveys[0].plans[0];
    expect(after.walls).toEqual(before.walls); expect(after.areas).toEqual(before.areas);
  } finally { await context.close(); }
});

test('new Draw Plan exposes Area without selecting Line and manual rectangle survives Done and reopening', async ({ page }) => {
  await seed(page); await page.locator('#addPlan').click(); await page.getByRole('button', { name: 'Draw Plan', exact: true }).click();
  await expect(page.locator('#areaTool')).toBeVisible(); await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
  await page.locator('#areaTool').click(); await page.keyboard.press('Escape');
  await expect(page.locator('#modalBack')).toBeHidden();
  await page.locator('#areaTool').click(); await page.getByRole('button', { name: 'Enter dimensions', exact: true }).click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await page.locator('#manualWidth').fill('100'); await page.locator('#manualHeight').fill('60'); await page.locator('#modalOk').click();
  const state = await saved(page), p = state.surveys[0].plans.find(p => p.id === state.surveys[0].activePlan);
  expect(p.walls).toEqual([]); expect(p.dimensions || []).toEqual([]);
  const area = p.areas.find(a => a.kind === 'manual-rectangle'); expect(area).toMatchObject({ width: 100, height: 60 });
  await expect(page.locator(`[data-area-label="${area.id}"]`).first()).toContainText('6,000 sq ft');
  await page.locator('#finishEdit').click(); await page.reload(); await page.locator('#continue').click();
  const reopened = (await saved(page)).surveys[0].plans.find(a => a.id === p.id);
  expect(reopened.areas).toEqual(p.areas); expect(reopened.walls).toEqual([]);
});
