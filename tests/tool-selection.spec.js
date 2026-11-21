const { test, expect } = require('@playwright/test');
const { seed, saved, fixture, drag } = require('./helpers/app');

const image = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="white"/></svg>').toString('base64');
function stateFor(uploaded = false) {
  const state = structuredClone(fixture);
  if (uploaded) Object.assign(state.surveys[0].plans[0], { image, imageWidth: 1000, imageHeight: 700 });
  return state;
}
async function editor(page, uploaded = false) {
  await seed(page, { state: stateFor(uploaded) }); await page.locator('#editPlan').click();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
async function screenPoint(page, x, y) {
  return page.locator('#planCanvas').evaluate((svg, value) => {
    const p = svg.createSVGPoint(); p.x = value.x; p.y = value.y;
    const q = p.matrixTransform(document.querySelector('#planScene').getScreenCTM());
    return { x: q.x, y: q.y };
  }, { x, y });
}
async function stroke(page, vertices) {
  const start = await screenPoint(page, ...vertices[0]); await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (const [x, y] of vertices.slice(1)) { const end = await screenPoint(page, x, y); await page.mouse.move(end.x, end.y, { steps: 8 }); }
  await page.mouse.up();
}
async function neutral(page) {
  await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool', 'pan');
  for (const id of ['line', 'free', 'measureWall', 'areaTool']) await expect(page.locator('#' + id)).not.toHaveClass(/\bprimary\b/);
}
for (const uploaded of [false, true]) {
  const name = uploaded ? 'uploaded' : 'drawn';
  test(`KD-003 ${name} Edit entry is neutral and pan/tap adds no walls`, async ({ page }) => {
    await editor(page, uploaded); await neutral(page);
    const before = (await saved(page)).surveys[0].plans[0], view = await page.locator('#planCanvas').getAttribute('viewBox');
    await stroke(page, [[300, 220], [400, 240]]);
    expect(await page.locator('#planCanvas').getAttribute('viewBox')).not.toBe(view);
    const spot = await screenPoint(page, 450, 250); await page.mouse.click(spot.x, spot.y);
    const after = (await saved(page)).surveys[0].plans[0];
    expect(after.walls).toEqual(before.walls); expect(after.dimensions).toEqual(before.dimensions);
    expect(after.cameras).toEqual(before.cameras); expect(after.image).toBe(before.image);
    await page.locator('#finishEdit').click(); await page.locator('#editPlan').click(); await neutral(page);
  });
}

test('KD-003 new Draw entry is neutral and leaves an empty plan on navigation', async ({ page }) => {
  await seed(page); await page.locator('#addPlan').click(); await page.getByRole('button', { name: 'Draw Plan', exact: true }).click();
  await neutral(page);
  const b = await page.locator('#planCanvas').boundingBox();
  await drag(page, { x: b.x + 250, y: b.y + 250 }, { x: b.x + 400, y: b.y + 280 });
  const state = await saved(page), survey = state.surveys[0], plan = survey.plans.find(p => p.id === survey.activePlan);
  expect(plan.walls).toEqual([]); expect(plan.dimensions || []).toEqual([]);
});

for (const uploaded of [false, true]) {
  test(`${uploaded ? 'uploaded' : 'drawn'} tools select explicitly, switch, draw, undo and save`, async ({ page }) => {
    await editor(page, uploaded); await neutral(page);
    const original = (await saved(page)).surveys[0].plans[0];
    await page.locator('#line').click();
    await expect(page.locator('#line')).toHaveClass(/\bprimary\b/); await expect(page.locator('#line')).toHaveAttribute('aria-pressed', 'true');
    await stroke(page, [[300, 220], [450, 220]]);
    let data = await saved(page); expect(data.surveys[0].plans[0].walls).toHaveLength(original.walls.length + 1);
    await page.locator('#free').click();
    await expect(page.locator('#free')).toHaveClass(/\bprimary\b/); await expect(page.locator('#line')).not.toHaveClass(/\bprimary\b/);
    await stroke(page, [[300, 270], [350, 300], [400, 270], [450, 300]]);
    data = await saved(page); const walls = data.surveys[0].plans[0].walls;
    expect(walls).toHaveLength(original.walls.length + 2); expect(walls.at(-1).points.length).toBeGreaterThan(2);
    await page.locator('#undo').click(); expect((await saved(page)).surveys[0].plans[0].walls).toHaveLength(original.walls.length + 1);
    await expect(page.locator('#free')).toHaveClass(/\bprimary\b/);
    await page.locator('#line').click(); await expect(page.locator('#line')).toHaveClass(/\bprimary\b/);
    await page.locator('#line').click(); await neutral(page);
    const before = (await saved(page)).surveys[0].plans[0].walls;
    await stroke(page, [[300, 400], [380, 420]]);
    expect((await saved(page)).surveys[0].plans[0].walls).toEqual(before);
    await page.locator('#finishEdit').click();
    await page.reload(); await page.locator('#continue').click();
    const reopened = (await saved(page)).surveys[0].plans[0];
    expect(reopened.walls).toEqual(before); expect(reopened.image).toBe(original.image); expect(reopened.cameras).toEqual(original.cameras);
    await page.locator('#editPlan').click(); await neutral(page);
  });
}

test('Measure is explicitly selected, saves a measurement, and exits to neutral', async ({ page }) => {
  await editor(page); await neutral(page);
  const before = (await saved(page)).surveys[0].plans[0];
  await page.locator('#measureWall').click(); await expect(page.locator('#measureWall')).toHaveAttribute('aria-pressed', 'true');
  if (await page.locator('#dismissMeasureHelp').count()) await page.locator('#dismissMeasureHelp').click();
  await stroke(page, [[300, 220], [450, 220]]);
  await page.locator('#dimensionPositionDone').click(); await page.locator('#oDistance').fill('25'); await page.locator('#modalOk').click();
  const after = (await saved(page)).surveys[0].plans[0];
  expect(after.dimensions).toHaveLength(before.dimensions.length + 1); expect(after.walls).toEqual(before.walls);
  await expect(page.locator('#measureWall')).toHaveClass(/\bprimary\b/);
  await page.locator('#measureWall').click(); await neutral(page);
  await stroke(page, [[320, 260], [420, 260]]); expect((await saved(page)).surveys[0].plans[0].walls).toEqual(before.walls);
});

for (const action of ['deselect', 'Done', 'Back']) {
  test(`${action} during an unfinished stroke cannot commit a wall on release`, async ({ page }) => {
    await editor(page); const before = (await saved(page)).surveys[0].plans[0].walls;
    await page.locator('#line').click(); const from = await screenPoint(page, 300, 220), to = await screenPoint(page, 450, 220);
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(page.locator('#strokePreview path')).toHaveCount(1);
    const control = action === 'deselect' ? '#line' : action === 'Done' ? '#finishEdit' : '#plans header [data-go="home"]';
    // Keyboard activation while a pointer is held exercises an interrupted stroke.
    await page.locator(control).focus(); await page.keyboard.press('Enter');
    if (action === 'Done') await expect(page.locator('#editPlan')).toBeVisible();
    if (action === 'Back') await expect(page.locator('#home')).toBeVisible();
    await page.mouse.up();
    if (action === 'Back') await page.locator('#continue').click();
    expect((await saved(page)).surveys[0].plans[0].walls).toEqual(before);
    if (action === 'deselect') await neutral(page);
    else { await page.locator('#editPlan').click(); await neutral(page); }
  });
}

test('actual image import and Edit start neutral without changing the uploaded image', async ({ page }) => {
  await seed(page); await page.locator('#addPlan').click();
  await page.getByRole('button', { name: 'Upload Plan (image or PDF)', exact: true }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT7sAAAAASUVORK5CYII=', 'base64');
  await page.locator('#planFile').setInputFiles({ name: 'synthetic-floor.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#cropBack')).toBeVisible(); await page.locator('#cropApply').click();
  await expect(page.locator('#cropBack')).toBeHidden();
  let state = await saved(page), survey = state.surveys[0], plan = survey.plans.find(p => p.id === survey.activePlan);
  expect(plan.image).toMatch(/^data:image\/jpeg/); const originalImage = plan.image;
  await page.locator('#editPlan').click(); await neutral(page);
  await stroke(page, [[300, 220], [400, 250]]);
  state = await saved(page); plan = state.surveys[0].plans.find(p => p.id === survey.activePlan);
  expect(plan.walls).toEqual([]); expect(plan.image).toBe(originalImage);
  await page.locator('#line').click(); await stroke(page, [[300, 220], [450, 220]]);
  await page.locator('#finishEdit').click(); await page.reload(); await page.locator('#continue').click();
  plan = (await saved(page)).surveys[0].plans.find(p => p.id === survey.activePlan);
  expect(plan.walls).toHaveLength(1); expect(plan.image).toBe(originalImage);
});

test('measurement Cancel preserves walls and the explicitly selected Measure mode', async ({ page }) => {
  await editor(page); const before = (await saved(page)).surveys[0].plans[0];
  await page.locator('#measureWall').click();
  if (await page.locator('#dismissMeasureHelp').count()) await page.locator('#dismissMeasureHelp').click();
  await stroke(page, [[300, 220], [450, 220]]); await page.locator('#dimensionCancel').click();
  await expect(page.locator('#measureWall')).toHaveClass(/\bprimary\b/);
  await page.locator('#measureWall').click(); await neutral(page);
  await page.locator('#finishEdit').click();
  const after = (await saved(page)).surveys[0].plans[0];
  expect(after.walls).toEqual(before.walls); expect(after.dimensions).toEqual(before.dimensions);
});

for (const uploaded of [false, true]) {
  test(`neutral touch pan and pinch preserve ${uploaded ? 'uploaded' : 'drawn'} plan geometry`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(); await seed(page, { state: stateFor(uploaded), target: 'http://127.0.0.1:8765/development/' });
      await page.locator('#editPlan').click(); await neutral(page);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const before = (await saved(page)).surveys[0].plans[0], view = await page.locator('#planCanvas').getAttribute('viewBox');
      const session = await context.newCDPSession(page), a = await screenPoint(page, 300, 220), b = await screenPoint(page, 400, 240);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 0 }] });
      for (let i = 1; i <= 8; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8, id: 0 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await page.locator('#planCanvas').getAttribute('viewBox')).not.toBe(view);
      const left = await screenPoint(page, 300, 220), right = await screenPoint(page, 450, 220);
      const beforePinch = await page.locator('#planCanvas').getAttribute('viewBox');
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...left, id: 0 }, { ...right, id: 1 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: left.x - 20, y: left.y, id: 0 }, { x: right.x + 20, y: right.y, id: 1 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await page.locator('#planCanvas').getAttribute('viewBox')).not.toBe(beforePinch);
      const after = (await saved(page)).surveys[0].plans[0];
      expect(after.walls).toEqual(before.walls); expect(after.dimensions).toEqual(before.dimensions);
      expect(after.cameras).toEqual(before.cameras); expect(after.image).toBe(before.image);
      await neutral(page);
    } finally { await context.close(); }
  });
}

test('Back to Sketch from the area guide does not implicitly activate Line', async ({ page }) => {
  const state = stateFor(), p = state.surveys[0].plans[0];
  const outline = [[100, 100], [900, 100], [900, 300], [500, 300], [500, 600], [100, 600]];
  p.walls = outline.map((a, i) => ({ id: 'l-wall-' + i, points: [a, outline[(i + 1) % outline.length]].map(([x, y]) => ({ x, y })) }));
  p.dimensions = []; p.areas = []; p.irregularSketchChoice = 'sketch';
  await seed(page, { state }); await page.locator('#editPlan').click();
  await page.locator('#measureWall').click();
  if (await page.locator('#dismissMeasureHelp').count()) await page.locator('#dismissMeasureHelp').click();
  await page.locator('#areaTool').click();
  await page.getByRole('button', { name: 'Calculate from drawn walls', exact: true }).click(); await expect(page.locator('#modalTitle')).toHaveText('Measure the Building');
  await page.getByRole('button', { name: 'Back to Sketch', exact: true }).click();
  await neutral(page); expect((await saved(page)).surveys[0].plans[0].walls).toEqual(p.walls);
});

test('Sketch Only preserves an explicitly selected Freehand tool instead of switching to Line', async ({ page }) => {
  await seed(page); await page.locator('#addPlan').click(); await page.getByRole('button', { name: 'Draw Plan', exact: true }).click();
  await page.locator('#free').click();
  // Keep the six-sided L clear of the floating toolbar at the new default 0°.
  const outline = [[250, 150], [750, 150], [750, 300], [500, 300], [500, 500], [250, 500]];
  for (let i = 0; i < outline.length; i++) {
    const start = await screenPoint(page, ...outline[i]);
    expect(await page.locator('#planCanvas').evaluate((svg,p)=>svg.contains(document.elementFromPoint(p.x,p.y)),start)).toBe(true);
    await stroke(page, [outline[i], outline[(i + 1) % outline.length]]);
  }
  await expect(page.locator('#modalTitle')).toHaveText('Irregular Building Shape Detected');
  await page.getByRole('button', { name: 'Sketch Only — Continue', exact: true }).click();
  await expect(page.locator('#free')).toHaveClass(/\bprimary\b/); await expect(page.locator('#line')).not.toHaveClass(/\bprimary\b/);
  const state = await saved(page), survey = state.surveys[0];
  expect(survey.plans.find(p => p.id === survey.activePlan).walls).toHaveLength(6);
});
