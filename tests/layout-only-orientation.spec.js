const {test,expect,chromium}=require('@playwright/test');
const {seed,saved,fixture,drag,point,cameraMode,KEY,TARGET}=require('./helpers/app');
const {contentPose,sameContentCenter,sameFraming,settle}=require('./helpers/rendered-plan');
const portrait={width:412,height:915},landscape={width:915,height:412};
const errors=new WeakMap();
test.beforeEach(async({page})=>{const list=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message))});
test.afterEach(async({page})=>expect(errors.get(page)||[]).toEqual([]));
async function workArea(page,canvas='planCanvas'){
 await settle(page);return page.locator('#'+canvas).evaluate(svg=>{const r=svg.getBoundingClientRect(),m=svg.querySelector('g').getScreenCTM(),p=new DOMPoint(r.left+r.width/2,r.top+r.height/2).matrixTransform(m.inverse());return{x:p.x,y:p.y,scale:Math.hypot(m.a,m.b),angle:Math.atan2(m.b,m.a),width:r.width,height:r.height}});
}
function sameArea(a,b){expect(Math.abs(a.x-b.x)*a.scale).toBeLessThan(.1);expect(Math.abs(a.y-b.y)*a.scale).toBeLessThan(.1);expect(a.scale).toBeCloseTo(b.scale,5);expect(a.angle).toBeCloseTo(b.angle,5)}
function stateWithAngle(angle=null){const s=structuredClone(fixture);s.surveys[0].plans[0].viewRotationOverride=angle;return s}
async function pan(page,canvas='planCanvas',dx=61,dy=37){const r=await page.locator('#'+canvas).boundingBox();await drag(page,{x:r.x+r.width*.15,y:r.y+r.height*.15},{x:r.x+r.width*.15+dx,y:r.y+r.height*.15+dy});await settle(page)}
test('physical orientation changes layout only and carries the current work area and zoom',async({page})=>{
 await page.setViewportSize(portrait);await seed(page,{state:stateWithAngle()});await page.locator('#zoomIn').click();await pan(page);const p=await workArea(page);
 await page.setViewportSize(landscape);sameArea(await workArea(page),p);expect((await workArea(page)).width).not.toBe(p.width);
 await page.locator('#zoomOut').click();await pan(page);const latest=await workArea(page);
 for(let i=0;i<3;i++){await page.setViewportSize(portrait);sameArea(await workArea(page),latest);await page.setViewportSize(landscape);sameArea(await workArea(page),latest)}
});
test('stale destination records cannot rotate, pan or zoom the current view on resize',async({page})=>{
 await page.setViewportSize(portrait);const s=stateWithAngle(90),p=s.surveys[0].plans[0],future=Date.now()+1000000;
 p.viewState={version:1,cx:500,cy:350,unitsPerPixel:2,rotation:90,updatedAt:1};
 p.orientationViews={version:1,active:'portrait',portrait:{...p.viewState},landscape:{version:1,cx:1200,cy:-900,unitsPerPixel:9,rotation:270,updatedAt:future,futureField:'retain'}};
 await seed(page,{state:s});const before=await workArea(page);await page.setViewportSize(landscape);sameArea(await workArea(page),before);
 const model=(await saved(page)).surveys[0].plans[0];expect(model.viewState.rotation).toBe(90);expect(model.orientationViews.active).toBe('landscape');expect(model.orientationViews.landscape.updatedAt).toBeGreaterThan(future);expect(model.orientationViews.landscape.futureField).toBe('retain');
});
for(const size of [portrait,landscape])for(const angle of [0,90,180,270])test(`legacy saved angle ${angle} is retained on ${size.width}px startup and resize`,async({page})=>{
 await page.setViewportSize(size);const state=stateWithAngle(),p=state.surveys[0].plans[0];p.viewState={version:1,cx:430,cy:280,unitsPerPixel:2,rotation:angle};
 await seed(page,{state});const before=await workArea(page);expect((await saved(page)).surveys[0].plans[0].viewState.rotation).toBe(angle);
 await page.setViewportSize(size===portrait?landscape:portrait);sameArea(await workArea(page),before);expect((await saved(page)).surveys[0].plans[0].viewState.rotation).toBe(angle);
});
for(const canvas of ['planCanvas','surveyCanvas'])test(`manual content anchoring coexists with layout-only resizing in ${canvas}`,async({page})=>{
 await page.setViewportSize(portrait);await seed(page,{state:stateWithAngle()});await page.locator('#zoomIn').click();await pan(page);
 if(canvas==='surveyCanvas')await cameraMode(page);const original=await contentPose(page,canvas),button=page.locator(canvas==='planCanvas'?'#rotatePlanView':'#rotateSurveyView');
 for(let i=0;i<2;i++){
  let content=await contentPose(page,canvas);await button.click();sameContentCenter(await contentPose(page,canvas),content);let area=await workArea(page,canvas);
  await page.setViewportSize(landscape);sameArea(await workArea(page,canvas),area);
  content=await contentPose(page,canvas);await button.click();sameContentCenter(await contentPose(page,canvas),content);area=await workArea(page,canvas);
  await page.setViewportSize(portrait);sameArea(await workArea(page,canvas),area);
 }
 sameFraming(await contentPose(page,canvas),original);
});
test('media-before-layout switch advances the active clock beyond a stale destination copy',async({page,browser})=>{
 await page.addInitScript(()=>{
  const native=window.matchMedia.bind(window),original=native('(orientation: landscape)'),media=new EventTarget();let forced=null;
  Object.defineProperty(media,'matches',{get:()=>forced===null?original.matches:forced});
  original.addEventListener('change',()=>media.dispatchEvent(new Event('change')));
  window.matchMedia=q=>q==='(orientation: landscape)'?media:native(q);
  window.auditOrientation=value=>{forced=value;media.dispatchEvent(new Event('change'));dispatchEvent(new Event('orientationchange'))};
 });
 await page.setViewportSize(portrait);const state=stateWithAngle(0),p=state.surveys[0].plans[0],future=Date.now()+1000000;
 p.viewState={version:1,cx:500,cy:350,unitsPerPixel:2,rotation:0,updatedAt:1};p.orientationViews={version:1,active:'portrait',portrait:{...p.viewState},landscape:{version:1,cx:-1200,cy:2000,unitsPerPixel:7,rotation:270,updatedAt:future}};
 await seed(page,{state});const before=await workArea(page);await page.evaluate(()=>auditOrientation(true));const early=await workArea(page);sameArea(early,before);expect(early.width).toBe(before.width);expect(early.height).toBe(before.height);
 let latest=await saved(page);expect(latest.surveys[0].plans[0].viewState.updatedAt).toBeGreaterThan(future);
 await page.setViewportSize(landscape);sameArea(await workArea(page),before);latest=await saved(page);
 await page.evaluate(async({key,latest,stale})=>{
  localStorage.setItem(key+'-full-mirror-v1748',JSON.stringify(latest));localStorage.setItem(key,JSON.stringify(stale));
  const db=await new Promise(resolve=>{const r=indexedDB.open('fsp-test-isolated-v1',1);r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(stale,key);t.oncomplete=resolve});db.close();
 },{key:KEY,latest,stale:state});
 const context=await browser.newContext({viewport:portrait,storageState:await page.context().storageState({indexedDB:true})});
 try{const reopened=await context.newPage();await reopened.goto(TARGET);await reopened.locator('#continue').click();sameArea(await workArea(reopened),before);const recovered=(await saved(reopened)).surveys[0].plans[0];expect(recovered.viewState.rotation).toBe(0);expect(recovered.viewState.unitsPerPixel).toBe(2);expect(recovered.orientationViews.landscape.updatedAt).toBeGreaterThan(future)}finally{await context.close()}
});
for(const size of [portrait,landscape])test(`camera single-finger manipulation and two-finger navigation survive resize from ${size.width}`,async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:size,hasTouch:true,isMobile:true,deviceScaleFactor:2.625});
 try{
  const page=await context.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));await seed(page,{state:stateWithAngle()});await page.locator('#rotatePlanView').click();await cameraMode(page);
  const cdp=await context.newCDPSession(page),touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],id)=>({x,y,id}))});
  const before=await workArea(page,'surveyCanvas'),from=await point(page,350,350),to=await point(page,400,380);
  await page.locator('#moveCameraMode').click();await touch('touchStart',[[from.x,from.y]]);for(let i=1;i<=15;i++)await touch('touchMove',[[from.x+(to.x-from.x)*i/15,from.y+(to.y-from.y)*i/15]]);await touch('touchEnd',[]);
  sameArea(await workArea(page,'surveyCanvas'),before);let model=(await saved(page)).surveys[0].plans[0];expect(model.cameras[0].x).toBeCloseTo(400,1);expect(model.cameras[0].y).toBeCloseTo(380,1);expect(model.fspRoutes[0].points[0]).toEqual({x:model.cameras[0].x,y:model.cameras[0].y});
  const geometry=structuredClone(model),r=await page.locator('#surveyCanvas').boundingBox(),x=r.x+r.width*.5,y=r.y+r.height*.2;
  await touch('touchStart',[[x-24,y],[x+24,y]]);for(let i=1;i<=10;i++)await touch('touchMove',[[x-24+3*i,y+2*i],[x+24+3*i,y+2*i]]);await touch('touchEnd',[]);
  const panned=await workArea(page,'surveyCanvas');expect(panned.scale).toBeCloseTo(before.scale,5);expect(Math.hypot(panned.x-before.x,panned.y-before.y)*before.scale).toBeGreaterThan(10);
  await touch('touchStart',[[x-20,y],[x+20,y]]);for(let d=25;d<=50;d+=5)await touch('touchMove',[[x-d,y],[x+d,y]]);await touch('touchEnd',[]);
  const zoomed=await workArea(page,'surveyCanvas');expect(zoomed.scale).toBeGreaterThan(panned.scale*2);expect(zoomed.angle).toBeCloseTo(before.angle,5);
  for(const viewport of [size===portrait?landscape:portrait,size]){await page.setViewportSize(viewport);sameArea(await workArea(page,'surveyCanvas'),zoomed)}
  model=(await saved(page)).surveys[0].plans[0];for(const k of ['walls','cameras','fspRacks','fspRoutes','dimensions'])expect(model[k]).toEqual(geometry[k]);
  await page.reload();await page.locator('#continue').click();await cameraMode(page);sameArea(await workArea(page,'surveyCanvas'),zoomed);expect(pageErrors).toEqual([]);
 }finally{await context.close()}
});
test('Edit/Done anchors and drawing coordinates remain correct across layout changes',async({page})=>{
 await page.setViewportSize(portrait);await seed(page,{state:stateWithAngle()});await page.locator('#editPlan').click();const before=await workArea(page);
 await page.setViewportSize(landscape);sameArea(await workArea(page),before);await page.locator('#line').click();
 const pt=(x,y)=>page.locator('#planScene').evaluate((scene,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform(scene.getScreenCTM());return{x:q.x,y:q.y}},{x,y});
 await drag(page,await pt(300,200),await pt(420,210));const model=(await saved(page)).surveys[0].plans[0],last=model.walls.at(-1).points;
 expect(model.walls).toHaveLength(5);expect(last[0].x).toBeCloseTo(300,1);expect(last[0].y).toBeCloseTo(200,1);expect(last.at(-1).x).toBeCloseTo(420,1);expect(last.at(-1).y).toBeCloseTo(210,1);
 const edit=await contentPose(page);await page.locator('#finishEdit').click();sameFraming(await contentPose(page),edit);const done=await workArea(page);await page.setViewportSize(portrait);sameArea(await workArea(page),done);
});
test('latest manually rotated view survives process restart into the opposite layout',async({baseURL})=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),profile=await fs.mkdtemp(path.join(os.tmpdir(),'fsp-layout-only-'));
 const options={baseURL,headless:true,viewport:portrait,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH};let context;
 try{
  context=await chromium.launchPersistentContext(profile,options);let page=await context.newPage();await seed(page,{state:stateWithAngle()});
  for(let i=0;i<3;i++)await page.locator('#rotatePlanView').click();await page.setViewportSize(landscape);await page.locator('#zoomOut').click();await pan(page);const latest=await workArea(page);await saved(page);
  await context.close();context=null;context=await chromium.launchPersistentContext(profile,options);page=await context.newPage();await page.goto(TARGET);await page.locator('#continue').click();sameArea(await workArea(page),latest);
  const content=await contentPose(page);await page.locator('#rotatePlanView').click();sameContentCenter(await contentPose(page),content);const manual=await workArea(page);await page.setViewportSize(landscape);sameArea(await workArea(page),manual);
 }finally{if(context)await context.close();await fs.rm(profile,{recursive:true,force:true})}
});
test('a new plan starts unrotated even when created in landscape',async({page})=>{
 await page.setViewportSize(landscape);await page.goto(TARGET);await page.locator('#newSurvey').click();await page.locator('#newName').fill('Synthetic layout-only landscape');await page.locator('#modalOk').click();await page.locator('#addPlan').click();await page.getByRole('button',{name:'Draw Plan',exact:true}).click();
 const before=await workArea(page);expect(before.angle).toBeCloseTo(0,5);expect((await saved(page)).surveys[0].plans[0].viewState.rotation).toBe(0);
 await page.setViewportSize(portrait);sameArea(await workArea(page),before);
});

test('PR15 boundary freezes viewport, rotation, measurements and saving',()=>{require('./helpers/move-camera-boundary').verifyCameraBoundary()});
