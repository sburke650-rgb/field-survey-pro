const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { seed, saved, point, drag, cameraMode } = require('./helpers/app');
const fixture = require('./fixtures/cable-routes.json');

function shippedGeometry() {
  const html = readFileSync('development/index.html', 'utf8');
  function slice(a, b) {
    const start = html.indexOf(a), end = html.indexOf(b, start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    return html.slice(start, end);
  }
  const context = vm.createContext({});
  vm.runInContext(slice('function dist(a,b)', 'function appendPath(') + slice('function straighten(', 'function closestRack('), context);
  return context;
}
function sample(vertices, spacing) {
  const points = [{ ...vertices[0] }];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1], b = vertices[i];
    const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing);
    for (let j = 1; j <= count; j++) points.push({ x: a.x + (b.x - a.x) * j / count, y: a.y + (b.y - a.y) * j / count });
  }
  return points;
}
const p = (x, y) => ({ x, y });
const length = points => points.slice(1).reduce((sum, b, i) => sum + Math.hypot(b.x - points[i].x, b.y - points[i].y), 0);
for (const [shape, vertices] of [
  ['L', [p(0, 0), p(50, 0), p(50, 50)]],
  ['U', [p(0, 0), p(50, 0), p(50, 50), p(0, 50)]],
  ['multiple bends and reversal', [p(0, 0), p(50, 0), p(50, 30), p(20, 30), p(20, 10), p(10, 10)]],
  ['small intentional bends', [p(0, 0), p(3, 0), p(3, 2), p(6, 2)]],
]) {
  test(`KD-001 ${shape}: preserve every nonduplicate sample and length`, () => {
    const { straighten } = shippedGeometry();
    for (const spacing of [1, 4, 12]) {
      const points = sample(vertices, spacing), original = structuredClone(points);
      const result = straighten(points);
      expect(result).toEqual(original);
      expect(length(result)).toBeCloseTo(length(original), 10);
      expect(points).toEqual(original);
      expect(result[0]).not.toBe(points[0]);
    }
  });
}

async function enterCable(page) {
  await page.locator('#surveyMore').click();
  await page.getByRole('button', { name: 'Cable Routes', exact: true }).click();
  if (await page.locator('#modalTitle').textContent() === 'How to Use Cable Routes') await page.locator('#modalOk').click();
  await expect(page.locator('#fspCableBar')).toBeVisible();
}
async function drawRoute(page, vertices) {
  const start = await point(page, vertices[0].x, vertices[0].y);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (let i = 1; i < vertices.length; i++) {
    const end = await point(page, vertices[i].x, vertices[i].y);
    const steps = Math.ceil(Math.hypot(vertices[i].x - vertices[i - 1].x, vertices[i].y - vertices[i - 1].y) / 5);
    await page.mouse.move(end.x, end.y, { steps });
  }
  await page.mouse.up();
}
function hasVertices(actual, intended) {
  for (const v of intended) expect(actual.some(q => Math.hypot(q.x - v.x, q.y - v.y) < 0.001), `Missing vertex ${JSON.stringify(v)}`).toBe(true);
}
async function reopen(page) {
  await page.reload(); await page.locator('#continue').click();
  return (await saved(page)).surveys[0].plans[0];
}
for (const [shape, vertices] of [
  ['L', [p(350, 350), p(800, 350), p(800, 450)]],
  ['multiple bends', [p(350, 350), p(450, 350), p(450, 200), p(700, 200), p(700, 450), p(800, 450)]],
]) {
  test(`draw ${shape} through UI, retain samples and metadata after saving/reopening`, async ({ page }) => {
    await seed(page, { state: fixture }); await cameraMode(page); await enterCable(page);
    await drawRoute(page, vertices);
    const plan = (await saved(page)).surveys[0].plans[0];
    const route = plan.fspRoutes.find(r => r.cameraId === 'cam-1');
    hasVertices(route.points, vertices);
    expect(route.points.length).toBeGreaterThan(vertices.length);
    expect(route).toMatchObject({ id: 'route-1', rackId: 'rack-1', fspEstimateFt: 150, fspVerticalFt: 12, fspSlackStartFt: 6, fspSlackEndFt: 8, name: 'Preserved route name', futureCableData: { label: 'synthetic retained metadata' } });
    expect(plan.fspRoutes.find(r => r.id === 'route-3')).toEqual(fixture.surveys[0].plans[0].fspRoutes[1]);
    expect((await reopen(page)).fspRoutes).toEqual(plan.fspRoutes);
  });
}

test('shared pathway join retains drawn endpoint and downstream corners without aliasing', async ({ page }) => {
  const state = structuredClone(fixture); state.surveys[0].plans[0].fspRoutes.pop();
  await seed(page, { state }); await cameraMode(page); await enterCable(page);
  const vertices = [p(300, 500), p(450, 500), p(450, 420), p(592, 420)];
  await drawRoute(page, vertices);
  await expect(page.locator('#modalTitle')).toHaveText('Select cable destination');
  await page.getByRole('button', { name: 'MDF', exact: true }).click();
  await expect(page.locator('#modalTitle')).toHaveText('Connect to shared pathway');
  await page.locator('#modalOk').click();
  const plan = (await saved(page)).surveys[0].plans[0];
  const branch = plan.fspRoutes.find(r => r.cameraId === 'cam-3');
  hasVertices(branch.points, [...vertices, p(600, 420), p(600, 450), p(800, 450)]);
  expect(plan.fspRoutes.find(r => r.id === 'route-1')).toEqual(state.surveys[0].plans[0].fspRoutes[0]);
  await expect(page.locator('[data-fsp-shared]').first()).toContainText('2 cables');
  await page.locator('#fspCableDone').click();
  await drag(page, await point(page, 300, 500), await point(page, 320, 520));
  const moved = (await saved(page)).surveys[0].plans[0];
  expect(moved.fspRoutes.find(r => r.id === 'route-1')).toEqual(plan.fspRoutes.find(r => r.id === 'route-1'));
  expect(moved.fspRoutes.find(r => r.cameraId === 'cam-3').points.slice(1)).toEqual(branch.points.slice(1));
  expect((await reopen(page)).fspRoutes).toEqual(moved.fspRoutes);
});

for (const type of ['MDF', 'IDF']) {
  test(`${type} movement preserves shared bends including an interior rack-coincident point`, async ({ page }) => {
    const state = structuredClone(fixture), plan = state.surveys[0].plans[0];
    plan.fspRacks[0].type = type;
    plan.fspRoutes[0].points.splice(2, 0, p(800, 450), p(750, 300));
    await seed(page, { state }); await cameraMode(page);
    const before = (await saved(page)).surveys[0].plans[0];
    await drag(page, await point(page, 800, 450), await point(page, 750, 500));
    const moved = (await saved(page)).surveys[0].plans[0];
    for (let i = 0; i < before.fspRoutes.length; i++) {
      expect(moved.fspRoutes[i].points.slice(0, -1)).toEqual(before.fspRoutes[i].points.slice(0, -1));
      expect(moved.fspRoutes[i].points.at(-1).x).toBeCloseTo(750, 0);
      expect(moved.fspRoutes[i].points.at(-1).y).toBeCloseTo(500, 0);
      expect({ ...moved.fspRoutes[i], points: [] }).toEqual({ ...before.fspRoutes[i], points: [] });
    }
    expect((await reopen(page)).fspRoutes).toEqual(moved.fspRoutes);
  });
}

test('camera movement preserves shared tails, names, manual footage and other route data', async ({ page }) => {
  await seed(page, { state: fixture }); await cameraMode(page);
  const before = (await saved(page)).surveys[0].plans[0];
  await drag(page, await point(page, 350, 350), await point(page, 400, 380));
  const after = (await saved(page)).surveys[0].plans[0];
  expect(after.fspRoutes[0].points.slice(1)).toEqual(before.fspRoutes[0].points.slice(1));
  expect({ ...after.fspRoutes[0], points: [] }).toEqual({ ...before.fspRoutes[0], points: [] });
  expect(after.fspRoutes[1]).toEqual(before.fspRoutes[1]);
  await page.locator('#surveyMore').click(); await page.getByRole('button', { name: 'Cable Lengths', exact: true }).click();
  await expect(page.locator('#modalBody')).toContainText('C1 — Synthetic camera — 176 ft');
  await expect(page.locator('#modalBody')).toContainText('C3 — Shared branch — 111 ft');
  expect((await reopen(page)).fspRoutes).toEqual(after.fspRoutes);
});

test('cleanup removes exact duplicates only and retains reversals', () => {
  const { straighten } = shippedGeometry();
  const points = [p(0, 0), p(0, 0), p(1, 0), p(0, 0), p(0, 0), p(0, 0.01)];
  const result = straighten(points);
  expect(result).toEqual([p(0, 0), p(1, 0), p(0, 0), p(0, 0.01)]);
  result[0].x = 100;
  expect(points[0].x).toBe(0);
});

test('sub-four-unit bends are retained by UI event sampling', async ({ page }) => {
  await seed(page, { state: fixture }); await cameraMode(page); await enterCable(page);
  const vertices = [p(350, 350), p(352, 350), p(352, 352), p(354, 352), p(354, 354), p(800, 354), p(800, 450)];
  await drawRoute(page, vertices);
  hasVertices((await saved(page)).surveys[0].plans[0].fspRoutes.find(r => r.cameraId === 'cam-1').points, vertices);
});

test('new sampled routes remain visible as shared pathways', async ({ page }) => {
  const state = structuredClone(fixture); state.surveys[0].plans[0].fspRoutes = [];
  await seed(page, { state }); await cameraMode(page); await enterCable(page);
  await drawRoute(page, [p(350, 350), p(600, 350), p(600, 450), p(800, 450)]);
  await saved(page);
  await drawRoute(page, [p(300, 500), p(450, 500), p(450, 420), p(592, 420)]);
  await page.getByRole('button', { name: 'MDF', exact: true }).click(); await page.locator('#modalOk').click();
  await saved(page);
  await expect(page.locator('[data-fsp-shared]').first()).toContainText('2 cables');
});

test('calculated cable length follows the retained pathway, while manual overrides are unchanged', () => {
  const html = readFileSync('development/index.html', 'utf8'), context = vm.createContext({ plan: structuredClone(fixture.surveys[0].plans[0]) });
  const start = html.indexOf('function cableScale()'), end = html.indexOf('function routeName(', start);
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
  vm.runInContext(html.slice(start, end), context);
  const route = { points: [p(350, 350), p(800, 350), p(800, 450)] };
  expect(context.routeTotals(route).horizontal).toBeCloseTo(66.25, 8);
  expect(context.routeTotals(route).total).toBeCloseTo(86.25, 8);
  expect(context.routeTotals(context.plan.fspRoutes[0]).total).toBe(176);
  expect(context.routeTotals(context.plan.fspRoutes[1]).total).toBe(111);
});

test('legacy cable backup export/import retains geometry, lengths, shared routes and unknown fields', async ({ page }) => {
  await seed(page, { state: fixture });
  await page.locator('#plans header [data-go="home"]').click(); await page.locator('#allSurveys').click();
  const event = page.waitForEvent('download'); await page.locator('#exportBackup').click();
  const download = await event; const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.surveys[0].plans[0].fspRoutes).toEqual(fixture.surveys[0].plans[0].fspRoutes);
  await page.locator('#backupFile').setInputFiles({ name: 'cable-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.locator('#modalOk').click(); await saved(page);
  expect((await reopen(page)).fspRoutes).toEqual(fixture.surveys[0].plans[0].fspRoutes);
});

test('dense existing shared routes retain their count badge', async ({ page }) => {
  const state = structuredClone(fixture);
  for (const r of state.surveys[0].plans[0].fspRoutes) r.points = sample(r.points, 4);
  await seed(page, { state }); await cameraMode(page);
  await expect(page.locator('[data-fsp-shared]').first()).toContainText('2 cables');
});

test('release position without a final pointermove remains in the saved pathway', async ({ page }) => {
  await seed(page, { state: fixture }); await cameraMode(page); await enterCable(page);
  const start = await point(page, 350, 350); await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (const v of [p(600, 350), p(790, 450)]) {
    const screen = await point(page, v.x, v.y); await page.mouse.move(screen.x, screen.y, { steps: 10 });
  }
  const release = await point(page, 793, 452);
  await page.locator('#surveyCanvas').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: release.x, clientY: release.y, bubbles: true });
  await page.mouse.up();
  hasVertices((await saved(page)).surveys[0].plans[0].fspRoutes.find(r => r.cameraId === 'cam-1').points, [p(790, 450), p(793, 452), p(800, 450)]);
});
