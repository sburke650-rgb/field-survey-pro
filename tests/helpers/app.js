const { expect } = require('@playwright/test');
const fixture = require('../fixtures/survey.json');
const KEY = 'fsp-test-isolated-v1-plans-cameras';
const TARGET = '/development/';
async function seed(page, { legacy = false, state = fixture, target = TARGET } = {}) {
  await page.addInitScript(({ state, key, legacy }) => {
    if (sessionStorage.getItem('regression-seeded')) return;
    localStorage.setItem(legacy ? key : key + '-full-mirror-v1748', JSON.stringify(state));
    sessionStorage.setItem('regression-seeded', 'yes');
  }, { state, key: KEY, legacy });
  await page.goto(target);
  await page.locator('#continue').click();
}
async function saved(page) {
  await expect(page.locator('#save')).toContainText('Saved');
  return page.evaluate(async key => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('fsp-test-isolated-v1', 1);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const r = db.transaction('state', 'readonly').objectStore('state').get(key);
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
    } finally { db.close(); }
  }, KEY);
}
async function point(page, x, y) {
  return page.locator('#surveyCanvas').evaluate((svg, { x, y }) => {
    const p = svg.createSVGPoint(); p.x = x; p.y = y;
    const q = p.matrixTransform(document.querySelector('#surveyScene').getScreenCTM());
    return { x: q.x, y: q.y };
  }, { x, y });
}
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 }); await page.mouse.up();
}
async function cameraMode(page) {
  await page.locator('#toSurvey').click();
  await expect(page.locator('#survey')).toBeVisible();
  // Wait for shared-view restoration before starting a pointer gesture.
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
async function deleteMeasurement(page) {
  await page.locator('#editPlan').click();
  await page.locator('[data-overlay-dimension="0"]').first().dispatchEvent('click');
  await page.locator('#dimensionPositionDone').click();
  await expect(page.locator('#modalTitle')).toHaveText('Distance on Plan');
  await page.getByRole('button', { name: 'Delete Measurement', exact: true }).click();
}
module.exports = { seed, saved, point, drag, cameraMode, deleteMeasurement, fixture, KEY, TARGET };
