const { expect } = require('@playwright/test');
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
}
// Measure full floor-plan content before clipping, using actual rendered wall
// paths and the image's fitted bitmap, not camera/route/label scene extents.
async function contentPose(page, canvas = 'planCanvas') {
  await settle(page);
  return page.locator('#' + canvas).evaluate(async svg => {
    const scene = svg.querySelector('g'), m = scene.getScreenCTM(), boxes = [];
    for (const wall of scene.querySelectorAll('path.wall')) {
      const b = wall.getBBox(); boxes.push({ left: b.x, top: b.y, right: b.x+b.width, bottom: b.y+b.height });
    }
    const image = scene.querySelector('image');
    if (image) {
      const bitmap = new Image(); bitmap.src = image.getAttribute('href'); await bitmap.decode();
      const w = image.width.baseVal.value, h = image.height.baseVal.value, ratio = Math.min(w/bitmap.naturalWidth,h/bitmap.naturalHeight);
      const iw = bitmap.naturalWidth*ratio, ih = bitmap.naturalHeight*ratio;
      const x = image.x.baseVal.value+(w-iw)/2, y = image.y.baseVal.value+(h-ih)/2;
      boxes.push({ left:x,top:y,right:x+iw,bottom:y+ih });
    }
    if (!boxes.length) boxes.push({ left:0,top:0,right:1000,bottom:700 });
    const b = { left:Math.min(...boxes.map(b=>b.left)),top:Math.min(...boxes.map(b=>b.top)),right:Math.max(...boxes.map(b=>b.right)),bottom:Math.max(...boxes.map(b=>b.bottom)) };
    const points = [[b.left,b.top],[b.right,b.top],[b.right,b.bottom],[b.left,b.bottom]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
    const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y)),r=svg.getBoundingClientRect();
    return { x:(left+right)/2,y:(top+bottom)/2,scale:Math.hypot(m.a,m.b),angle:Math.atan2(m.b,m.a),
      bounds:{left,right,top,bottom},canvas:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},matrix:[m.a,m.b,m.c,m.d,m.e,m.f] };
  });
}
function sameContentCenter(actual, expected) {
  expect(Math.abs(actual.x-expected.x)).toBeLessThan(.1);
  expect(Math.abs(actual.y-expected.y)).toBeLessThan(.1);
  expect(actual.scale).toBeCloseTo(expected.scale,5);
}
function sameFraming(actual, expected) {
  sameContentCenter(actual,expected);
  for (const k of ['left','right','top','bottom']) expect(Math.abs(actual.bounds[k]-expected.bounds[k])).toBeLessThan(.1);
  actual.matrix.forEach((v,i)=>expect(Math.abs(v-expected.matrix[i])).toBeLessThan(i<4?1e-5:.1));
}
module.exports = { contentPose, sameContentCenter, sameFraming, settle };
