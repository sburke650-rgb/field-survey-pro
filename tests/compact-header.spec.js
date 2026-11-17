const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {seed,saved,fixture,KEY}=require('./helpers/app');
const baseline='/test/v17-129/';
const rect=locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}});
async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))))}
async function hit(locator){await expect(locator).toBeVisible();expect(await locator.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})).toBe(true)}
async function pose(page){return page.locator('#planScene').evaluate(scene=>{const m=scene.getScreenCTM();return{scale:Math.hypot(m.a,m.b),points:[[100,100],[900,100],[900,600],[100,600]].map(([x,y])=>{const q=new DOMPoint(x,y).matrixTransform(m);return{x:q.x,y:q.y}})}})}
function samePose(a,b){expect(a.scale).toBeCloseTo(b.scale,6);a.points.forEach((p,i)=>{expect(Math.abs(p.x-b.points[i].x)).toBeLessThan(.1);expect(Math.abs(p.y-b.points[i].y)).toBeLessThan(.1)})}
function geometry(state){return state.surveys.map(s=>s.plans.map(p=>Object.fromEntries(['id','image','walls','dimensions','areas','cameras','fspRacks','fspRoutes'].map(k=>[k,p[k]]))))}

test('orientation repair preserves all scripts outside viewport state and reconciliation',()=>{
  const original=fs.readFileSync('test/v17-130/index.html','utf8'),current=fs.readFileSync('development/index.html','utf8');
  const scripts=s=>[...s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const normalize=script=>{
    for(const [start,end] of [
      ['   const selectedAt=Math.max(', '   const deleted=new Set('],
      ['function setViewBox(', 'function zoomPlan('],
      ['// Viewport schema v2 adds', 'function openSharedView('],
    ]){
      const a=script.indexOf(start),b=script.indexOf(end,a);
      expect(a).toBeGreaterThan(-1);expect(b).toBeGreaterThan(a);
      script=script.slice(0,a)+'/* scoped viewport repair */'+script.slice(b);
    }
    return script.replace('   recoverOrientationView(pl);\n','').replace(' orientationAnchor=null;\n','');
  };
  const before=scripts(original),after=scripts(current);
  expect(current.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'SCRIPT')).toEqual(original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'SCRIPT'));
  expect(after.slice(1)).toEqual(before.slice(1));
  expect(normalize(after[0])).toEqual(normalize(before[0]));
  expect(current).not.toContain('Floor plan confirmed. Edit anytime.');
});

for(const viewport of [{width:320,height:640},{width:412,height:915},{width:915,height:412},{width:640,height:280}]){
 test(`compact header retains accessible controls and safe insets at ${viewport.width}x${viewport.height}`,async({browser,baseURL})=>{
  const context=await browser.newContext({baseURL,viewport,hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await seed(page);await page.evaluate(()=>{for(const[k,v]of Object.entries({top:18,left:24,right:24,bottom:16}))document.documentElement.style.setProperty('--fsp-safe-'+k,v+'px');dispatchEvent(new Event('resize'))});await settle(page);
   const initialGeometry=geometry(await saved(page));
   for(const editing of [false,true]){
    if(editing)await page.locator('#editPlan').tap();await settle(page);
    const header=await rect(page.locator('#plans>header'));expect(header.height).toBe(44);expect(header.x).toBeGreaterThanOrEqual(24);expect(header.right).toBeLessThanOrEqual(viewport.width-24);
    for(const selector of ['#plans header [data-go="home"]','#plansTitle','#save','#planSelect','#planMore','#rotatePlanView'])await hit(page.locator(selector));
    for(const selector of ['#plans header [data-go="home"]','#planSelect','#planMore','#rotatePlanView']){const r=await rect(page.locator(selector));expect(r.height).toBeGreaterThanOrEqual(44);expect(r.x).toBeGreaterThanOrEqual(24);expect(r.right).toBeLessThanOrEqual(viewport.width-24)}
    const canvas=await rect(page.locator('#planCanvas')),rotate=await rect(page.locator('#rotatePlanView'));
    expect(rotate.width).toBe(44);expect(rotate.x-canvas.x).toBeGreaterThan(0);expect(canvas.right-rotate.right).toBeLessThanOrEqual(10);expect(rotate.y-canvas.y).toBeLessThanOrEqual(10);
    await expect(page.getByText('Floor plan confirmed. Edit anytime.',{exact:true})).toHaveCount(0);
    if(!editing)await expect(page.locator('#planHint')).toBeHidden();
   }
   await page.locator('#planSelect').selectOption(fixture.surveys[0].plans[1].id);await settle(page);await page.locator('#planSelect').selectOption(fixture.surveys[0].plans[0].id);await settle(page);
   expect(geometry(await saved(page))).toEqual(initialGeometry);expect(errors).toEqual([]);
  }finally{await context.close()}
 });
}

for(const viewport of [{width:412,height:915},{width:740,height:320}]){
 test(`compact layout preserves the V17.129 saved screen anchor and scale at ${viewport.width}`,async({browser,baseURL})=>{
  const original=await browser.newContext({baseURL,viewport}),updated=await browser.newContext({baseURL,viewport});
  try{
   const before=await original.newPage();await seed(before,{target:baseline});await settle(before);await before.locator('#zoomIn').click();await settle(before);
   const expected=await pose(before),state=await saved(before),beforeCanvas=await rect(before.locator('#planCanvas'));
   const page=await updated.newPage();await seed(page,{state});await settle(page);
   if(viewport.width<viewport.height)samePose(await pose(page),expected);
   else {
    expect((await pose(page)).scale).toBeCloseTo(expected.scale,6);
    const stored=state.surveys[0].plans[0].viewState;
    const center=await page.locator('#planCanvas').evaluate(svg=>{const b=svg.viewBox.baseVal;return {x:b.x+b.width/2,y:b.y+b.height/2}});
    expect(center.x).toBeCloseTo(stored.cx,3);expect(center.y).toBeCloseTo(stored.cy,3);
   }
   const migrated=await pose(page);
   const afterCanvas=await rect(page.locator('#planCanvas'));expect(afterCanvas.height).toBeGreaterThan(beforeCanvas.height);
   const data=geometry(await saved(page));expect(data).toEqual(geometry(state));
   await page.locator('#editPlan').click();await settle(page);samePose(await pose(page),migrated);
   await page.locator('#finishEdit').click();await settle(page);samePose(await pose(page),migrated);
   await page.reload();await page.locator('#continue').click();await settle(page);samePose(await pose(page),migrated);
  }finally{await original.close();await updated.close()}
 });
}
