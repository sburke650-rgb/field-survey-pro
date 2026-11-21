const { test, expect } = require('@playwright/test');
const { seed, saved, point, drag, cameraMode } = require('./helpers/app');

async function openDetails(page) {
  const camera = await point(page, 350, 350);
  await page.mouse.click(camera.x, camera.y);
  await expect(page.locator('#detail')).toBeVisible();
}
async function headerPoint(page) {
  await page.locator('#detail').evaluate(panel => { panel.scrollTop = 0; });
  const box = await page.locator('#detailDrag').boundingBox();
  return { x: box.x + 20, y: box.y + box.height / 2 };
}
async function withinScreen(page) {
  const bounds = await page.locator('#detail').evaluate(panel => {
    const r = panel.getBoundingClientRect(), a = document.querySelector('#surveyArea').getBoundingClientRect(), v = visualViewport;
    return { x: r.left, y: r.top, right: r.right, bottom: r.bottom,
      leftLimit: Math.max(a.left, v?.offsetLeft || 0), topLimit: Math.max(a.top, v?.offsetTop || 0),
      rightLimit: Math.min(a.right, (v?.offsetLeft || 0) + (v?.width || innerWidth)),
      bottomLimit: Math.min(a.bottom, (v?.offsetTop || 0) + (v?.height || innerHeight)) };
  });
  expect(bounds.x).toBeGreaterThanOrEqual(bounds.leftLimit);
  expect(bounds.y).toBeGreaterThanOrEqual(bounds.topLimit);
  expect(bounds.right).toBeLessThanOrEqual(bounds.rightLimit + 0.5);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.bottomLimit + 0.5);
}

test('KD-002 header drag moves panel without changing camera, cone, floor plan or saved survey', async ({ page }) => {
  await seed(page); await cameraMode(page); await openDetails(page);
  const before = await page.locator('#detail').boundingBox(), data = await saved(page);
  const scene = await page.locator('#surveyScene').innerHTML(), view = await page.locator('#surveyCanvas').getAttribute('viewBox');
  const handle = await headerPoint(page);
  await drag(page, handle, { x: handle.x + (before.x > 550 ? -180 : 180), y: handle.y + (before.y > 425 ? -90 : 90) });
  const after = await page.locator('#detail').boundingBox();
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(100);
  expect(await page.locator('#surveyScene').innerHTML()).toBe(scene);
  expect(await page.locator('#surveyCanvas').getAttribute('viewBox')).toBe(view);
  expect(await saved(page)).toEqual(data);
  await withinScreen(page);
});

for (const [layout, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  test(`mouse drag stays inside all ${layout} screen boundaries`, async ({ page }) => {
    await page.setViewportSize(viewport); await seed(page); await cameraMode(page); await openDetails(page);
    for (const target of [{ x: 1, y: 1 }, { x: viewport.width - 1, y: 1 }, { x: viewport.width - 1, y: viewport.height - 1 }, { x: 1, y: viewport.height - 1 }]) {
      await drag(page, await headerPoint(page), target); await withinScreen(page);
    }
    await page.locator('#closeDetail').click(); await expect(page.locator('#detail')).toBeHidden();
  });
}

test('resizing and changing orientation reclamps the open panel without altering survey geometry', async ({ page }) => {
  await seed(page); await cameraMode(page); await openDetails(page);
  const data = await saved(page), handle = await headerPoint(page);
  await drag(page, handle, { x: 1050, y: 800 });
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 360, height: 340 }]) {
    await page.setViewportSize(size);
    await expect.poll(async () => {
      const b = await page.locator('#detail').boundingBox(); return b.y + b.height;
    }).toBeLessThanOrEqual(size.height);
    await withinScreen(page);
    await page.locator('#doneDetail').scrollIntoViewIfNeeded(); await expect(page.locator('#doneDetail')).toBeVisible();
  }
  expect((await saved(page)).surveys[0].plans[0].cameras).toEqual(data.surveys[0].plans[0].cameras);
  expect((await saved(page)).surveys[0].plans[0].walls).toEqual(data.surveys[0].plans[0].walls);
});

test('number, status, notes, Done and Close work after moving the panel', async ({ page }) => {
  await seed(page); await cameraMode(page); await openDetails(page);
  const h = await headerPoint(page); await drag(page, h, { x: h.x + 150, y: h.y - 80 });
  await page.locator('#detailNumber').fill('9'); await page.locator('#detailNumber').press('Tab');
  await page.locator('#detailType [data-camera-type="New"]').click();
  await page.locator('#detailNotes').fill('Synthetic edited notes');
  expect((await saved(page)).surveys[0].plans[0].cameras[0]).toMatchObject({ num: '9', type: 'New', notes: 'Synthetic edited notes', x: 350, y: 350, angle: 0 });
  await page.locator('#doneDetail').click(); await expect(page.locator('#detail')).toBeHidden();
  await openDetails(page); await expect(page.locator('#detailNumber')).toHaveValue('9');
  const before = await page.locator('#detail').boundingBox(), close = await page.locator('#closeDetail').boundingBox();
  await page.mouse.move(close.x + close.width / 2, close.y + close.height / 2); await page.mouse.down();
  expect(await page.locator('#detail').boundingBox()).toEqual(before);
  await page.mouse.up(); await expect(page.locator('#detail')).toBeHidden();
  await page.reload(); await page.locator('#continue').click();
  expect((await saved(page)).surveys[0].plans[0].cameras[0]).toMatchObject({ num: '9', type: 'New', notes: 'Synthetic edited notes' });
});

test('camera number swap confirmation and cancellation remain functional', async ({ page }) => {
  await seed(page); await cameraMode(page); await openDetails(page);
  await page.locator('#detailNumber').fill('2'); await page.locator('#detailNumber').press('Tab');
  await expect(page.locator('#modalTitle')).toHaveText('Swap Camera Numbers'); await page.locator('#modalCancel').click();
  expect((await saved(page)).surveys[0].plans[0].cameras[0].num).toBe('1');
  await page.locator('#detailNumber').fill('2'); await page.locator('#detailNumber').press('Tab'); await page.locator('#modalOk').click();
  const plans = (await saved(page)).surveys[0].plans;
  expect(plans[0].cameras[0].num).toBe('2'); expect(plans[1].cameras[0].num).toBe('1');
});

test('Delete Camera cancellation and confirmation work after a panel drag', async ({ page }) => {
  await seed(page); await cameraMode(page); await openDetails(page);
  const h = await headerPoint(page); await drag(page, h, { x: h.x + 100, y: h.y - 60 });
  await page.locator('#deleteCamera').click(); await page.locator('#modalCancel').click();
  expect((await saved(page)).surveys[0].plans[0].cameras).toHaveLength(1);
  await page.locator('#deleteCamera').click(); await page.locator('#modalOk').click();
  await expect(page.locator('#detail')).toBeHidden();
  expect((await saved(page)).surveys[0].plans[0].cameras).toHaveLength(0);
});

test('landscape panel body scrolls normally without moving the panel or canvas', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 260 }); await seed(page); await cameraMode(page); await openDetails(page);
  const before = await page.locator('#detail').boundingBox(), view = await page.locator('#surveyCanvas').getAttribute('viewBox');
  await page.mouse.move(before.x + before.width - 8, before.y + before.height / 2); await page.mouse.wheel(0, 150);
  await expect.poll(() => page.locator('#detail').evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  expect(await page.locator('#detail').boundingBox()).toEqual(before);
  expect(await page.locator('#surveyCanvas').getAttribute('viewBox')).toBe(view);
  await page.locator('#doneDetail').click(); await expect(page.locator('#detail')).toBeHidden();
});

async function touchDrag(session, page, from, to) {
  const contact = (x, y) => [{ x, y, id: 0 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: contact(from.x, from.y) });
  for (let i = 1; i <= 10; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: contact(from.x + (to.x - from.x) * i / 10, from.y + (to.y - from.y) * i / 10) });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
for (const [layout, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  test(`touchscreen header dragging works and stays bounded in ${layout}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(); await seed(page, { target: 'http://127.0.0.1:8765/development/' }); await cameraMode(page);
      const session = await context.newCDPSession(page), c = await point(page, 350, 350);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 0 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await expect(page.locator('#detail')).toBeVisible();
      const before = await page.locator('#detail').boundingBox(), view = await page.locator('#surveyCanvas').getAttribute('viewBox'), data = await saved(page);
      const h = await headerPoint(page), target = { x: h.x + (before.x > viewport.width / 2 ? -100 : 100), y: h.y + (before.y > viewport.height / 2 ? -80 : 80) };
      await touchDrag(session, page, h, target);
      const after = await page.locator('#detail').boundingBox();
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(30);
      // Preserving the shared plan viewport can change the panel's starting
      // edge. Assert movement in the commanded direction, for either edge.
      if (layout === 'portrait') expect(Math.sign(after.y - before.y)).toBe(Math.sign(target.y - h.y));
      else expect(Math.sign(after.x - before.x)).toBe(Math.sign(target.x - h.x));
      await withinScreen(page);
      for (const target of [{ x: 1, y: 1 }, { x: viewport.width - 1, y: viewport.height - 1 }]) {
        await touchDrag(session, page, await headerPoint(page), target); await withinScreen(page);
      }
      expect(await page.locator('#surveyCanvas').getAttribute('viewBox')).toBe(view); expect(await saved(page)).toEqual(data);
      await page.locator('#closeDetail').tap();
      await expect(page.locator('#detail')).toBeHidden();
    } finally { await context.close(); }
  });
}


test('touch controls activate exactly once after dragging and retain edits', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(); await seed(page, { target: 'http://127.0.0.1:8765/development/' }); await cameraMode(page); await openDetails(page);
    const session = await context.newCDPSession(page), h = await headerPoint(page);
    await touchDrag(session, page, h, { x: h.x - 50, y: h.y - 100 });
    await page.locator('#detailType [data-camera-type="New"]').evaluate(button => { window.newClicks = 0; button.addEventListener('click', () => window.newClicks++); });
    await page.locator('#detailNumber').fill('9');
    // Tapping the status button must blur/save the number field as a native tap would.
    await page.locator('#detailType [data-camera-type="New"]').tap();
    await page.locator('#detailNotes').fill('Synthetic touch notes');
    await page.locator('#doneDetail').tap(); await expect(page.locator('#detail')).toBeHidden();
    expect(await page.evaluate(() => window.newClicks)).toBe(1);
    expect((await saved(page)).surveys[0].plans[0].cameras[0]).toMatchObject({ num: '9', type: 'New', notes: 'Synthetic touch notes', x: 350, y: 350, angle: 0 });
  } finally { await context.close(); }
});

test('touch scrolling does not drag the panel or activate buttons', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 260 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(); await seed(page, { target: 'http://127.0.0.1:8765/development/' }); await cameraMode(page); await openDetails(page);
    const session = await context.newCDPSession(page), before = await page.locator('#detail').boundingBox(), data = await saved(page);
    const view = await page.locator('#surveyCanvas').getAttribute('viewBox');
    // Scroll from blank panel padding, not inside a field that can consume the gesture.
    expect(await page.locator('#detail').evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
    await touchDrag(session, page, { x: before.x + before.width - 8, y: before.y + before.height / 2 }, { x: before.x + before.width - 8, y: before.y + 15 });
    await expect.poll(() => page.locator('#detail').evaluate(e => e.scrollTop)).toBeGreaterThan(0);
    expect(await page.locator('#detail').boundingBox()).toEqual(before);
    expect(await page.locator('#surveyCanvas').getAttribute('viewBox')).toBe(view); expect(await saved(page)).toEqual(data);
    await page.locator('#doneDetail').tap(); await expect(page.locator('#detail')).toBeHidden();
  } finally { await context.close(); }
});

test('cancelled touch drag releases state and allows a new header drag', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(); await seed(page, { target: 'http://127.0.0.1:8765/development/' }); await cameraMode(page); await openDetails(page);
    const session = await context.newCDPSession(page), h = await headerPoint(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: h.x, y: h.y, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: h.x - 30, y: h.y - 40, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const before = await page.locator('#detail').boundingBox(), next = await headerPoint(page);
    await touchDrag(session, page, next, { x: next.x + 50, y: next.y - 70 });
    const after = await page.locator('#detail').boundingBox();
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(30);
    await withinScreen(page); await page.locator('#closeDetail').tap(); await expect(page.locator('#detail')).toBeHidden();
  } finally { await context.close(); }
});
