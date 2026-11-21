const {test,expect,chromium}=require('@playwright/test');
const {seed,saved,fixture,point,drag,cameraMode,KEY,TARGET}=require('./helpers/app');
const portrait={width:412,height:915},landscape={width:915,height:412};
let errors=[];function watch(page){page.on('pageerror',e=>errors.push(e.message))}
test.beforeEach(async({page})=>{errors=[];watch(page)});test.afterEach(()=>expect(errors).toEqual([]));
const model=async page=>(await saved(page)).surveys[0].plans[0];
const geometry=p=>Object.fromEntries(['walls','cameras','dimensions','areas','fspRacks','fspRoutes'].map(k=>[k,p[k]]));
const box=page=>page.locator('#surveyCanvas').getAttribute('viewBox');
async function start(page,size=portrait,state=fixture){await page.setViewportSize(size);await seed(page,{state});await cameraMode(page)}
async function on(page){await page.locator('#moveCameraMode').click();await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','true')}
function near(p,x,y){expect(p.x).toBeCloseTo(x,1);expect(p.y).toBeCloseTo(y,1)}
for(const size of [portrait,landscape])test(`default Pan locks cameras and pans when swiping a camera at ${size.width}`,async({page})=>{
 await start(page,size);const before=await model(page),v=await box(page);await drag(page,await point(page,350,350),await point(page,400,380));
 expect(await box(page)).not.toBe(v);expect(geometry(await model(page))).toEqual(geometry(before));await expect(page.locator('#detail')).toBeHidden();
});
async function touchSession(context,page){await page.evaluate(()=>document.addEventListener('pointerdown',e=>window.lastTestPointer=e.pointerId,true));const cdp=await context.newCDPSession(page);return(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((p,i)=>({...p,id:p.id??i}))})}
for(const size of [portrait,landscape]){
 test(`toggle is beside Add Camera and repeatedly moves ANY camera at ${size.width}`,async({page})=>{
  const state=structuredClone(fixture);state.surveys[0].plans[0].cameras.push({id:'cam-extra',num:'9',type:'New',x:600,y:250,angle:45,notes:'keep'});
  await start(page,size,state);expect(await page.locator('#addCamera').evaluate(b=>b.nextElementSibling.id)).toBe('moveCameraMode');const add=await page.locator('#addCamera').boundingBox(),toggle=await page.locator('#moveCameraMode').boundingBox();expect(toggle.y).toBeCloseTo(add.y,1);expect(toggle.x).toBeGreaterThanOrEqual(add.x+add.width);await on(page);await expect(page.locator('#moveCameraMode')).toHaveClass(/\bprimary\b/);
  const before=await model(page),v=await box(page);
  for(const [from,to,index] of [[[350,350],[400,380],0],[[600,250],[550,280],1],[[400,380],[370,330],0]]){
   await drag(page,await point(page,...from),await point(page,...to));near((await model(page)).cameras[index],...to);expect(await box(page)).toBe(v);await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','true');
  }
  const after=await model(page);expect(after.fspRoutes[0].points[0]).toEqual({x:after.cameras[0].x,y:after.cameras[0].y});expect(after.fspRoutes[0].points.slice(1)).toEqual(before.fspRoutes[0].points.slice(1));expect(after.walls).toEqual(before.walls);expect(after.dimensions).toEqual(before.dimensions);expect(after.areas).toEqual(before.areas);
  await page.locator('#moveCameraMode').click();await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');
 });
 test(`empty-space one-finger gestures do not pan while Move Camera is on at ${size.width}`,async({page})=>{
  await start(page,size);await on(page);const before=await model(page),v=await box(page);await drag(page,await point(page,100,200),await point(page,180,230));expect(await box(page)).toBe(v);expect(geometry(await model(page))).toEqual(geometry(before));await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','true');
 });
 for(const mode of ['Pan','Move Camera'])test(`two fingers starting on a camera pan/pinch without camera movement: ${mode} ${size.width}`,async({browser,baseURL})=>{
  const context=await browser.newContext({baseURL,viewport:size,hasTouch:true,isMobile:true,deviceScaleFactor:2.625});try{
   const page=await context.newPage();watch(page);await seed(page);await cameraMode(page);if(mode==='Move Camera')await on(page);
   const before=await model(page),v=await box(page),touch=await touchSession(context,page),a=await point(page,350,350),b=await point(page,100,200);
   await touch('touchStart',[a]);await touch('touchStart',[a,b]);expect(await box(page)).toBe(v);
   for(let i=1;i<=8;i++)await touch('touchMove',[{x:a.x+3*i,y:a.y+2*i},{x:b.x+3*i,y:b.y+2*i}]);const panned=await box(page);expect(panned).not.toBe(v);panned.split(' ').slice(2).map(Number).forEach((n,i)=>expect(n).toBeCloseTo(v.split(' ').slice(2).map(Number)[i],3));
   for(let i=1;i<=8;i++)await touch('touchMove',[{x:a.x+24+4*i,y:a.y+16},{x:b.x+24-4*i,y:b.y+16}]);const pinched=await box(page);expect(+pinched.split(' ')[2]).toBeLessThan(+panned.split(' ')[2]);await touch('touchEnd',[]);
   expect(geometry(await model(page))).toEqual(geometry(before));await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed',mode==='Move Camera'?'true':'false');await expect(page.locator('#detail')).toBeHidden();
  }finally{await context.close()}
 });
 for(const mode of ['Pan','Move Camera'])test(`long-press Details is preserved: ${mode} ${size.width}`,async({page})=>{
  await start(page,size);if(mode==='Move Camera')await on(page);const before=await model(page),p=await point(page,350,350);await page.mouse.move(p.x,p.y);await page.mouse.down();await expect(page.locator('#detail')).toBeVisible();await page.mouse.up();await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');expect(geometry(await model(page))).toEqual(geometry(before));await page.locator('#doneDetail').click();await expect(page.locator('#detail')).toBeHidden();
 });
}
for(const action of ['Back','Done','More','Add Camera','rotation','plan change','editor','Details','toolbar collapse','background'])test(`Move Camera automatically cancels on ${action}`,async({page})=>{
 await start(page);await on(page);
 if(action==='Back')await page.locator('#backPlans').evaluate(b=>b.click());
 if(action==='Done')await page.locator('#surveyDone').click();
 if(action==='More')await page.locator('#surveyMore').click();
 if(action==='Add Camera')await page.locator('#addCamera').click();
 if(action==='rotation')await page.locator('#rotateSurveyView').click();
 if(action==='plan change')await page.locator('#surveyPlanSelect').selectOption('plan-2',{force:true});
 if(action==='editor'){await page.locator('#surveyMore').click();await page.getByRole('button',{name:'Edit Plan',exact:true}).click()}
 if(action==='Details'){const p=await point(page,350,350);await page.mouse.move(p.x,p.y);await page.mouse.down();await expect(page.locator('#detail')).toBeVisible();await page.mouse.up()}
 if(action==='toolbar collapse')await page.locator('#minTools').click();
 if(action==='background')await page.evaluate(()=>dispatchEvent(new Event('pagehide')));
 await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');
});
test('Add Camera adds one camera, is mutually exclusive, and Move takes ownership from pending placement',async({page})=>{
 await start(page);await on(page);await page.locator('#addCamera').click();await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');const before=await model(page);let p=await point(page,250,250);await page.mouse.click(p.x,p.y);p=await point(page,150,150);await page.mouse.click(p.x,p.y);const after=await model(page);expect(after.cameras).toHaveLength(before.cameras.length+1);near(after.cameras.at(-1),250,250);expect(after.cameras.at(-1)).toMatchObject({num:'3',type:'New'});
 await page.locator('#addCamera').click();await on(page);await expect(page.locator('#addCamera')).not.toHaveClass(/primary|placing-existing/);p=await point(page,200,150);await page.mouse.click(p.x,p.y);expect((await model(page)).cameras).toEqual(after.cameras);
});
test('explicit cone handle retains adjustment without moving camera or plan, and exits Move Camera',async({page})=>{
 await start(page);await on(page);const camera=await point(page,350,350);await page.mouse.click(camera.x,camera.y);const before=await model(page),v=await box(page);await drag(page,await point(page,450,350),await point(page,450,420));const after=await model(page);expect(after.cameras[0].angle).not.toBe(before.cameras[0].angle);near(after.cameras[0],350,350);expect(after.fspRoutes).toEqual(before.fspRoutes);expect(await box(page)).toBe(v);await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');
});
for(const action of ['pointercancel','lost capture','second finger','resize','background','tool'])test(`in-flight camera preview cancels without saving movement: ${action}`,async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:portrait,hasTouch:true,isMobile:true});try{
  const page=await context.newPage();watch(page);await seed(page);await cameraMode(page);await on(page);const before=await model(page),touch=await touchSession(context,page),p=await point(page,350,350),end=await point(page,400,380);await touch('touchStart',[p]);await touch('touchMove',[end]);expect(geometry(await model(page))).toEqual(geometry(before));
  if(action==='pointercancel')await touch('touchCancel',[]);
  if(action==='lost capture')await page.locator('#surveyCanvas').evaluate(s=>s.releasePointerCapture(window.lastTestPointer));
  if(action==='second finger')await touch('touchStart',[end,await point(page,100,200)]);
  if(action==='resize')await page.setViewportSize(landscape);
  if(action==='background')await page.evaluate(()=>dispatchEvent(new Event('pagehide')));
  if(action==='tool')await page.locator('#addCamera').dispatchEvent('click');
  if(action!=='pointercancel')await touch('touchEnd',[]);await page.evaluate(()=>dispatchEvent(new Event('pagehide')));expect(geometry(await model(page))).toEqual(geometry(before));
 }finally{await context.close()}
});
test('mode is off after reload and opening another survey',async({page})=>{
 await start(page);await on(page);await page.reload();await page.locator('#continue').click();await cameraMode(page);await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');await on(page);await page.locator('#backPlans').evaluate(b=>b.click());await page.locator('#plans header [data-go="home"]').click();await page.locator('#newSurvey').click();await page.locator('#newName').fill('Synthetic new survey');await page.locator('#modalOk').click();await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');
});
test('Move Done remains accessible after dragging the toolbar in short landscape',async({page})=>{
 await start(page,landscape);const h=await page.locator('#dragTools').boundingBox();await drag(page,{x:h.x+h.width/2,y:h.y+h.height/2},{x:landscape.width-70,y:landscape.height-50});await on(page);const bar=await page.locator('#floatTools').boundingBox(),done=await page.locator('#surveyDone').boundingBox();expect(bar.y+bar.height).toBeLessThanOrEqual(done.y+1);await page.locator('#surveyDone').click();await expect(page.locator('#plans')).toBeVisible();await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');
});
test('save failures are shown as failures rather than Saved after an intentional camera move',async({page})=>{
 await start(page);await on(page);const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss()});await page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key+'-full-mirror-v1748')throw Error('Synthetic mirror failure');return original.call(this,k,v)};IDBObjectStore.prototype.put=function(){throw Error('Synthetic IDB failure')}},KEY);
 await drag(page,await point(page,350,350),await point(page,400,380));await expect(page.locator('#surveySave')).toHaveText('Save failed !');expect(dialogs.some(s=>s.includes('Autosave failed'))).toBe(true);
});
test('PR15 boundary freezes rotation, viewport, measurements, square footage and save implementation',()=>{require('./helpers/move-camera-boundary').verifyCameraBoundary()});
test('actual browser restart never restores active Move Camera mode',async({baseURL})=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),profile=await fs.mkdtemp(path.join(os.tmpdir(),'fsp-move-toggle-'));let context;const opts={baseURL,viewport:portrait,headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH};
 try{context=await chromium.launchPersistentContext(profile,opts);let page=await context.newPage();watch(page);await seed(page);await cameraMode(page);await on(page);const before=await model(page);await context.close();context=null;
 context=await chromium.launchPersistentContext(profile,opts);page=await context.newPage();watch(page);await page.goto(TARGET);await page.locator('#continue').click();await cameraMode(page);await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');const v=await box(page);await drag(page,await point(page,350,350),await point(page,400,380));expect(await box(page)).not.toBe(v);expect(geometry(await model(page))).toEqual(geometry(before));
 }finally{if(context)await context.close();await fs.rm(profile,{recursive:true,force:true})}
});
for(const size of [portrait,landscape])test(`Android touch: Pan, locked empty space and repeated intentional moves ${size.width}`,async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:size,isMobile:true,hasTouch:true,deviceScaleFactor:2.625});try{
 const page=await context.newPage();watch(page);await seed(page);await cameraMode(page);const before=await model(page),touch=await touchSession(context,page);
 async function swipe(from,to){await touch('touchStart',[from]);for(let i=1;i<=8;i++)await touch('touchMove',[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8}]);await touch('touchEnd',[])}
 const v=await box(page);await swipe(await point(page,100,200),await point(page,160,240));expect(await box(page)).not.toBe(v);expect(geometry(await model(page))).toEqual(geometry(before));await on(page);const locked=await box(page);
 await swipe(await point(page,100,200),await point(page,160,240));expect(await box(page)).toBe(locked);
 for(const [from,to] of [[[350,350],[400,380]],[[400,380],[370,330]]]){await swipe(await point(page,...from),await point(page,...to));const after=await model(page);near(after.cameras[0],...to);expect(after.fspRoutes[0].points[0]).toEqual({x:after.cameras[0].x,y:after.cameras[0].y});expect(after.fspRoutes[0].points.slice(1)).toEqual(before.fspRoutes[0].points.slice(1));expect(await box(page)).toBe(locked);await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','true')}
 }finally{await context.close()}
});
for(const move of [false,true])test(`duplicate viewport notification does not cancel stationary long-press ${move}`,async({page})=>{
 await start(page);if(move)await on(page);const p=await point(page,350,350);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.evaluate(()=>dispatchEvent(new Event('fsp-viewport-change')));await expect(page.locator('#detail')).toBeVisible();await page.mouse.up();await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed','false');
});
for(const size of [portrait,landscape])for(const move of [false,true])test(`second finger on cone handle joins navigation without heading edit ${size.width} ${move}`,async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:size,hasTouch:true,isMobile:true});try{
 const page=await context.newPage();watch(page);await seed(page);await cameraMode(page);const c=await point(page,350,350);await page.mouse.click(c.x,c.y);if(move)await on(page);const before=await model(page),v=await box(page),touch=await touchSession(context,page),handle=await point(page,450,350);
 await touch('touchStart',[c]);await touch('touchStart',[c,handle]);for(let i=1;i<=8;i++)await touch('touchMove',[{x:c.x-i*2,y:c.y+i},{x:handle.x+i*3,y:handle.y+i}]);await touch('touchEnd',[]);expect(await box(page)).not.toBe(v);expect(geometry(await model(page))).toEqual(geometry(before));await expect(page.locator('#moveCameraMode')).toHaveAttribute('aria-pressed',move?'true':'false');
 }finally{await context.close()}
});
