const { test, expect, chromium } = require('@playwright/test');
const { seed, saved, fixture, drag, point, cameraMode, TARGET, KEY } = require('./helpers/app');
const { contentPose, sameContentCenter, sameFraming, settle } = require('./helpers/rendered-plan');
const errors = new WeakMap();
test.beforeEach(async ({page})=>{const list=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message))});
test.afterEach(async ({page})=>expect(errors.get(page)||[]).toEqual([]));
async function drawNew(page,{offCenter=false}={}) {
  await page.goto(TARGET); await page.locator('#newSurvey').click(); await page.locator('#newName').fill('Synthetic manual-rotation regression'); await page.locator('#modalOk').click();
  await page.locator('#addPlan').click(); await page.getByRole('button',{name:'Draw Plan',exact:true}).click(); await settle(page); await page.locator('#line').click();
  const r=await page.locator('#planCanvas').boundingBox(),cx=offCenter ? .6 : .5,cy=r.height<500?(offCenter ? .45 : .4):(offCenter ? .55 : .5),hy=r.height<500 ? .12 : .25;
  const vertices=[[-.2,-hy],[.2,-hy],[.2,hy],[-.2,hy],[-.2,-hy]].map(([x,y])=>({x:r.x+(cx+x)*r.width,y:r.y+(cy+y)*r.height}));
  for(let i=0;i<4;i++)await drag(page,vertices[i],vertices[i+1]);
  const before=await saved(page),s=before.surveys[0],model=s.plans.find(p=>p.id===s.activePlan);expect(model.walls).toHaveLength(4);
  const edit=await contentPose(page);await page.locator('#finishEdit').click();await expect(page.locator('#editPlan')).toBeVisible();sameFraming(await contentPose(page),edit);
  return model;
}
async function fourTurns(page,{canvas='planCanvas',tap=false}={}) {
  const start=await contentPose(page,canvas),before=(await saved(page)),s=before.surveys.find(s=>s.id===before.active),model=s.plans.find(p=>p.id===s.activePlan),angle=model.viewState.rotation;
  const button=page.locator(canvas==='planCanvas'?'#rotatePlanView':'#rotateSurveyView');
  for(let i=1;i<=4;i++){
    if(tap)await button.tap();else await button.click();
    sameContentCenter(await contentPose(page,canvas),start);
    const state=await saved(page),sv=state.surveys.find(s=>s.id===state.active),p=sv.plans.find(p=>p.id===sv.activePlan);
    expect(p.viewState.rotation).toBe((angle+i*90)%360);
    expect(p.orientationViews[p.orientationViews.active].rotation).toBe(p.viewState.rotation);
    const inactive=model.orientationViews.active==='portrait'?'landscape':'portrait';expect(p.orientationViews[inactive]).toEqual(model.orientationViews[inactive]);
    for(const k of ['walls','areas','image','imageWidth','imageHeight','dimensions','cameras','fspRacks','fspRoutes'])expect(p[k]).toEqual(model[k]);
  }
  sameFraming(await contentPose(page,canvas),start);return start;
}
test('fresh Draw → Done → four manual turns preserve rendered content framing',async({page})=>{
  await page.setViewportSize({width:412,height:915});await drawNew(page);const start=await fourTurns(page);
  await page.reload();await page.locator('#continue').click();sameFraming(await contentPose(page),start);
});

test('manual-only source boundary preserves every other application byte',()=>{
 const {readFileSync}=require('node:fs'),{createHash}=require('node:crypto');
 const html=readFileSync('development/index.html','utf8'),a=html.indexOf('function rotateVisiblePlan90(){'),b=html.indexOf('function enableAutomaticPlanRotation()',a);
 expect(a).toBeGreaterThan(-1);expect(b).toBeGreaterThan(a);
 expect(createHash('sha256').update(html.slice(0,a)+'MANUAL_HANDLER'+html.slice(b)).digest('hex')).toBe('cee153485049f877edb17b5a4bdb97966f7edbd431094d2941132df170cb00f4');
});
for(const viewport of [{width:412,height:915},{width:915,height:412}])for(const zoom of [-1,0,2])for(const pan of [false,true]){
 test(`Draw Done manual framing ${viewport.width} zoom ${zoom} pan ${pan}`,async({page})=>{
  await page.setViewportSize(viewport);await drawNew(page,{offCenter:pan});
  if(zoom<0)await page.locator('#zoomOut').click();else for(let i=0;i<zoom;i++)await page.locator('#zoomIn').click();
  if(pan){const r=await page.locator('#planCanvas').boundingBox();await drag(page,{x:r.x+r.width*.12,y:r.y+r.height*.12},{x:r.x+r.width*.12+70,y:r.y+r.height*.12+55})}
  const start=await fourTurns(page);await page.reload();await page.locator('#continue').click();sameFraming(await contentPose(page),start);
 });
}
for(const angle of [0,90,180,270])test(`manual framing from saved angle ${angle} excludes labels and cameras`,async({page})=>{
 await page.setViewportSize({width:412,height:915});const state=structuredClone(fixture),p=state.surveys[0].plans[0];p.viewRotationOverride=angle;
 p.areas[0].pos={x:1100,y:350};p.cameras.push({id:'far-camera',num:'99',type:'New',x:-2000,y:3000,angle:0,notes:'Synthetic outlier'});
 await seed(page,{state});await page.locator('#zoomIn').click();await fourTurns(page);
});
test('manual clipping preserves zoom instead of fitting the rotated plan',async({page})=>{
 await page.setViewportSize({width:412,height:915});const state=structuredClone(fixture),p=state.surveys[0].plans[0];
 p.walls=[{id:'tall',points:[{x:375,y:25},{x:625,y:25},{x:625,y:675},{x:375,y:675},{x:375,y:25}]}];p.areas=[];p.dimensions=[];
 await seed(page,{state});const initial=await contentPose(page);expect(initial.bounds.left).toBeGreaterThan(initial.canvas.left);expect(initial.bounds.right).toBeLessThan(initial.canvas.right);
 await page.locator('#rotatePlanView').click();const turned=await contentPose(page);sameContentCenter(turned,initial);
 expect(turned.bounds.right-turned.bounds.left).toBeGreaterThan(turned.canvas.width);
 expect(turned.bounds.left<turned.canvas.left||turned.bounds.right>turned.canvas.right).toBe(true);
 for(let i=0;i<3;i++)await page.locator('#rotatePlanView').click();sameFraming(await contentPose(page),initial);
});
for(const width of [1400,500])test(`full ${width}px image and outlying wall bounds share one manual anchor`,async({page})=>{
 await page.setViewportSize({width:412,height:915});const state=structuredClone(fixture),p=state.surveys[0].plans[0];
 p.image='data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="700"><rect width="100%" height="100%" fill="white"/></svg>`).toString('base64');p.imageWidth=width;p.imageHeight=700;
 p.walls.push({id:'outside-image',points:[{x:1200,y:650},{x:1400,y:800}]});
 await seed(page,{state});await fourTurns(page);
});
test('empty plan manual rotation remains finite and returns after 360 degrees',async({page})=>{
 await page.setViewportSize({width:412,height:915});const state=structuredClone(fixture),p=state.surveys[0].plans[0];
 for(const k of ['walls','areas','dimensions','cameras','fspRacks','fspRoutes'])p[k]=[];
 await seed(page,{state});await fourTurns(page);
});
test('Android-emulated taps rotate content through four angles with no drift',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:{width:412,height:915},hasTouch:true,isMobile:true,deviceScaleFactor:2.625});
 try{
  const page=await context.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));await seed(page);await fourTurns(page,{tap:true});expect(pageErrors).toEqual([]);
 }finally{await context.close()}
});
test('ten manual cycles preserve off-center framing and persisted zoom',async({page})=>{
 await page.setViewportSize({width:412,height:915});await seed(page);await page.locator('#zoomIn').click();
 const r=await page.locator('#planCanvas').boundingBox();await drag(page,{x:r.x+r.width*.15,y:r.y+r.height*.15},{x:r.x+r.width*.15+70,y:r.y+r.height*.15+50});
 const original=await contentPose(page);for(let i=0;i<10;i++)sameFraming(await fourTurns(page),original);
 await page.reload();await page.locator('#continue').click();sameFraming(await contentPose(page),original);
});
for(const angle of [0,90,180,270])test(`interaction and reload alignment after manual angle ${angle}`,async({page})=>{
 await page.setViewportSize({width:412,height:915});const state=structuredClone(fixture);state.surveys[0].plans[0].viewRotationOverride=(angle+270)%360;
 await seed(page,{state});await page.locator('#zoomOut').click();await page.locator('#zoomOut').click();
 const framing=await contentPose(page);await page.locator('#rotatePlanView').click();sameContentCenter(await contentPose(page),framing);
 await cameraMode(page);const canvas=await contentPose(page,'surveyCanvas');
 await drag(page,await point(page,350,350),await point(page,400,380));let p=(await saved(page)).surveys[0].plans[0];
 expect(p.cameras[0].x).toBeCloseTo(400,1);expect(p.cameras[0].y).toBeCloseTo(380,1);sameFraming(await contentPose(page,'surveyCanvas'),canvas);
 expect(p.fspRoutes[0].points[0]).toEqual({x:p.cameras[0].x,y:p.cameras[0].y});
 const bends=structuredClone(p.fspRoutes[0].points.slice(1,-1));
 const from=await point(page,800,450),to=await point(page,750,500);
 for(const q of [from,to]){expect(q.x).toBeGreaterThan(canvas.canvas.left);expect(q.x).toBeLessThan(canvas.canvas.right);expect(q.y).toBeGreaterThan(canvas.canvas.top);expect(q.y).toBeLessThan(canvas.canvas.bottom)}
 await drag(page,from,to);p=(await saved(page)).surveys[0].plans[0];
 expect(p.fspRacks[0].x).toBeCloseTo(750,1);expect(p.fspRacks[0].y).toBeCloseTo(500,1);expect(p.fspRoutes[0].points.slice(1,-1)).toEqual(bends);
 expect(p.fspRoutes[0].points.at(-1)).toEqual({x:p.fspRacks[0].x,y:p.fspRacks[0].y});sameFraming(await contentPose(page,'surveyCanvas'),canvas);
 await page.locator('#surveyDone').click();await page.locator('#editPlan').click();await settle(page);await page.locator('#line').click();
 const coordinate=(x,y)=>page.locator('#planScene').evaluate((scene,{x,y})=>{const p=new DOMPoint(x,y).matrixTransform(scene.getScreenCTM());return{x:p.x,y:p.y}},{x,y});
 await drag(page,await coordinate(300,200),await coordinate(420,210));p=(await saved(page)).surveys[0].plans[0];const last=p.walls.at(-1).points;
 expect(p.walls).toHaveLength(5);expect(last[0].x).toBeCloseTo(300,1);expect(last[0].y).toBeCloseTo(200,1);expect(last.at(-1).x).toBeCloseTo(420,1);expect(last.at(-1).y).toBeCloseTo(210,1);
 const before=await contentPose(page);await page.locator('#finishEdit').click();sameFraming(await contentPose(page),before);
 const snapshot=(await saved(page)).surveys[0].plans[0];await page.reload();await page.locator('#continue').click();sameFraming(await contentPose(page),before);
 p=(await saved(page)).surveys[0].plans[0];for(const k of ['walls','cameras','dimensions','fspRacks','fspRoutes'])expect(p[k]).toEqual(snapshot[k]);
});

test('manual content framing survives a real browser process restart at 270 degrees',async({baseURL})=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'fsp-manual-framing-'));
 const options={baseURL,headless:true,viewport:{width:412,height:915},executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH};let context;
 try{
  context=await chromium.launchPersistentContext(profile,options);let page=await context.newPage();await seed(page);await page.locator('#zoomIn').click();
  const r=await page.locator('#planCanvas').boundingBox();await drag(page,{x:r.x+r.width*.15,y:r.y+r.height*.15},{x:r.x+r.width*.15+60,y:r.y+r.height*.15+40});
  const original=await contentPose(page);for(let i=0;i<3;i++){await page.locator('#rotatePlanView').click();sameContentCenter(await contentPose(page),original)}
  const expected=await contentPose(page),model=(await saved(page)).surveys[0].plans[0];expect(model.viewState.rotation).toBe(270);
  await context.close();context=null;context=await chromium.launchPersistentContext(profile,options);page=await context.newPage();await page.goto(TARGET);await page.locator('#continue').click();
  sameFraming(await contentPose(page),expected);const reopened=(await saved(page)).surveys[0].plans[0];expect(reopened.viewState.rotation).toBe(270);expect(reopened.orientationViews.portrait.rotation).toBe(270);
  for(const k of ['walls','cameras','fspRacks','fspRoutes','dimensions'])expect(reopened[k]).toEqual(model[k]);
 }finally{if(context)await context.close();await fs.rm(profile,{recursive:true,force:true})}
});
