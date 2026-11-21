const {test,expect,chromium}=require('@playwright/test');
const {seed,saved,fixture,point,drag,cameraMode,KEY,TARGET}=require('./helpers/app');
const {settle}=require('./helpers/rendered-plan');
const portrait={width:412,height:915},landscape={width:915,height:412};
let pageErrors=[];
function watch(page){page.on('pageerror',e=>pageErrors.push(e.message))}
test.beforeEach(async({page})=>{pageErrors=[];watch(page)});
test.afterEach(()=>expect(pageErrors).toEqual([]));
async function start(page,state=fixture){await page.setViewportSize(portrait);await seed(page,{state});await cameraMode(page)}
const model=async page=>(await saved(page)).surveys[0].plans[0];
const box=page=>page.locator('#surveyCanvas').getAttribute('viewBox');
const geometry=p=>Object.fromEntries(['cameras','walls','dimensions','areas','fspRacks','fspRoutes'].map(k=>[k,p[k]]));
test('Navigate camera swipe pans without moving or selecting the camera',async({page})=>{
 await start(page);const before=await model(page),v=await box(page);
 await drag(page,await point(page,350,350),await point(page,400,380));
 expect(await box(page)).not.toBe(v);expect(geometry(await model(page))).toEqual(geometry(before));
 await expect(page.locator('#detail')).toBeHidden();await expect(page.locator('[data-handle]')).toHaveCount(0);
});
test('a stationary camera tap opens Details without moving geometry or view',async({page})=>{
 await start(page);const before=await model(page),v=await box(page),p=await point(page,350,350);
 await page.mouse.click(p.x,p.y);await expect(page.locator('#detail')).toBeVisible();
 expect(await box(page)).toBe(v);expect(geometry(await model(page))).toEqual(geometry(before));
});
async function enterMove(page){await page.locator('#moveCameraMode').click();await expect(page.locator('#cameraInteractionMode')).toHaveText('Move Camera')}
async function hold(page,x=350,y=350){const p=await point(page,x,y);await page.mouse.move(p.x,p.y);await page.mouse.down();await expect(page.locator('[data-camera-armed]')).toHaveCount(1);return p}
async function renderedCamera(page){return page.locator('#surveyScene [data-cam="cam-1"] circle[r="13"]').evaluate(c=>({x:+c.getAttribute('cx'),y:+c.getAttribute('cy')}))}
async function flush(page){await page.evaluate(()=>dispatchEvent(new Event('pagehide')));return model(page)}
async function persisted(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key+'-full-mirror-v1748')),KEY)}
async function touchSession(context,page){const cdp=await context.newCDPSession(page);return(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p.x,y:p.y,id:p.id??i}))})}
function closeTo(p,x,y){expect(p.x).toBeCloseTo(x,1);expect(p.y).toBeCloseTo(y,1)}
test('Move hold previews only, locks the view, then atomically saves camera and route once',async({page})=>{
 await start(page);await enterMove(page);const before=await model(page),v=await box(page);await hold(page);
 await page.evaluate(key=>{window.cameraSaves=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key+'-full-mirror-v1748')window.cameraSaves++;return original.call(this,k,v)}},KEY);
 const p=await point(page,420,390);await page.mouse.move(p.x,p.y,{steps:10});
 closeTo(await renderedCamera(page),420,390);expect(await box(page)).toBe(v);expect(geometry(await model(page))).toEqual(geometry(before));
 const previewRoute=await page.locator('#surveyScene path[stroke="#0d9488"]').first().evaluate(p=>{const q=p.getPointAtLength(0);return{x:q.x,y:q.y}});closeTo(previewRoute,420,390);
 await page.mouse.up();const after=await model(page);closeTo(after.cameras[0],420,390);
 expect(after.fspRoutes[0].points[0]).toEqual({x:after.cameras[0].x,y:after.cameras[0].y});expect(after.fspRoutes[0].points.slice(1)).toEqual(before.fspRoutes[0].points.slice(1));
 expect(await page.evaluate(()=>cameraSaves)).toBe(1);await expect(page.locator('[data-camera-armed]')).toHaveCount(0);
});
for(const action of ['pointercancel','lost capture','background','resize','canvas layout','manual rotation','mode Done','screen transition','tool switch'])test(`preview cancellation: ${action} leaves saved camera and routes unchanged`,async({page})=>{
 await start(page);await enterMove(page);const before=await model(page);await hold(page);const p=await point(page,410,385);await page.mouse.move(p.x,p.y,{steps:8});
 expect(geometry(await model(page))).toEqual(geometry(before));
 if(action==='pointercancel')await page.locator('#surveyCanvas').evaluate(s=>s.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
 if(action==='lost capture')await page.locator('#surveyCanvas').evaluate(s=>s.releasePointerCapture(1));
 if(action==='background')await flush(page);
 if(action==='resize')await page.setViewportSize(landscape);
 if(action==='canvas layout'){await page.locator('#surveyCanvas').evaluate(s=>s.style.width='calc(100% - 20px)');await expect(page.locator('[data-camera-armed]')).toHaveCount(0)}
 if(action==='manual rotation')await page.locator('#rotateSurveyView').dispatchEvent('click');
 if(action==='mode Done')await page.locator('#doneMoveCamera').dispatchEvent('click');
 if(action==='screen transition')await page.locator('#surveyDone').dispatchEvent('click');
 if(action==='tool switch')await page.locator('#addCamera').dispatchEvent('click');
 await page.mouse.up();await flush(page);expect(geometry(await model(page))).toEqual(geometry(before));
 await expect(page.locator('[data-camera-armed]')).toHaveCount(0);
});
test('Move early swipe navigates, never opens Details or arms a stale timer',async({page})=>{
 await start(page);await enterMove(page);const before=await model(page),v=await box(page);
 await drag(page,await point(page,350,350),await point(page,400,380));await page.waitForTimeout(620);
 expect(await box(page)).not.toBe(v);expect(geometry(await model(page))).toEqual(geometry(before));await expect(page.locator('#detail')).toBeHidden();await expect(page.locator('[data-camera-armed]')).toHaveCount(0);
});
test('stationary hold/release does not save; a new camera tap in Move opens Details',async({page})=>{
 await start(page);await enterMove(page);const before=await persisted(page);await hold(page);await page.mouse.up();
 expect(await persisted(page)).toEqual(before);const p=await point(page,350,350);await page.mouse.click(p.x,p.y);await expect(page.locator('#detail')).toBeVisible();
 await page.locator('#doneDetail').click();await expect(page.locator('#cameraInteractionMode')).toHaveText('Move Camera');await page.locator('#doneMoveCamera').click();await expect(page.locator('#cameraInteractionMode')).toHaveText('Navigate');await expect(page.locator('#survey')).toBeVisible();
});
for(const phase of ['pending','armed','moving'])test(`second finger cancels ${phase} camera gesture and navigates without a jump`,async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:portrait,isMobile:true,hasTouch:true});try{
 const page=await context.newPage();watch(page);await seed(page);await cameraMode(page);await enterMove(page);const before=await model(page),v=await box(page),touch=await touchSession(context,page);
 const a=await point(page,350,350),b=await point(page,650,150);await touch('touchStart',[a]);
 if(phase!=='pending')await expect(page.locator('[data-camera-armed]')).toHaveCount(1);
 let first=a;if(phase==='moving'){first=await point(page,410,380);await touch('touchMove',[first])}
 await touch('touchStart',[first,b]);expect(await box(page)).toBe(v);await expect(page.locator('[data-camera-armed]')).toHaveCount(0);
 for(let i=1;i<=8;i++)await touch('touchMove',[{x:first.x+i*3,y:first.y+i*2},{x:b.x+i*3,y:b.y+i*2}]);
 expect(await box(page)).not.toBe(v);await touch('touchEnd',[{x:first.x+24,y:first.y+16,id:0}]);await touch('touchMove',[{x:first.x+35,y:first.y+20,id:0}]);await touch('touchEnd',[]);
 await page.waitForTimeout(620);expect(geometry(await model(page))).toEqual(geometry(before));await expect(page.locator('#detail')).toBeHidden();
 }finally{await context.close()}
});
test('outside second contact cancels a draft without stealing a toolbar interaction',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:portrait,isMobile:true,hasTouch:true});try{
 const page=await context.newPage();watch(page);await seed(page);await cameraMode(page);await enterMove(page);const before=await model(page),touch=await touchSession(context,page),a=await point(page,350,350);
 await touch('touchStart',[a]);await expect(page.locator('[data-camera-armed]')).toHaveCount(1);await touch('touchMove',[{x:a.x+30,y:a.y}]);
 await touch('touchStart',[{x:a.x+30,y:a.y},{x:10,y:15}]);await expect(page.locator('[data-camera-armed]')).toHaveCount(0);await touch('touchEnd',[]);expect(geometry(await model(page))).toEqual(geometry(before));
 }finally{await context.close()}
});
test('third contact and two-to-one release never revive a camera or jump the plan',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:portrait,isMobile:true,hasTouch:true});try{
 const page=await context.newPage();watch(page);await seed(page);await cameraMode(page);await enterMove(page);const before=await model(page),touch=await touchSession(context,page),a=await point(page,350,350),b=await point(page,650,150),c=await point(page,100,150);
 await touch('touchStart',[a,b]);await touch('touchMove',[{x:a.x+20,y:a.y},b]);const v=await box(page);
 await touch('touchStart',[{x:a.x+20,y:a.y},b,c]);await touch('touchMove',[{x:a.x+35,y:a.y},b,c]);expect(await box(page)).toBe(v);
 await touch('touchEnd',[{x:a.x+35,y:a.y,id:0},{...b,id:1}]);(await box(page)).split(' ').map(Number).forEach((n,i)=>expect(n).toBeCloseTo(v.split(' ').map(Number)[i],3));await touch('touchEnd',[]);expect(geometry(await model(page))).toEqual(geometry(before));
 }finally{await context.close()}
});
test('terminal release coordinates commit with grab offset even without a final move event',async({page})=>{
 await start(page);await enterMove(page);const from=await point(page,360,350);await page.mouse.move(from.x,from.y);await page.mouse.down();await expect(page.locator('[data-camera-armed]')).toHaveCount(1);
 const end=await point(page,410,390);await page.locator('#surveyCanvas').evaluate((s,p)=>s.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:p.x,clientY:p.y,bubbles:true})),end);await page.mouse.up();closeTo((await model(page)).cameras[0],400,390);
});
for(const angle of [0,90,180,270])test(`camera preview, route metadata and release alignment at angle ${angle}`,async({page})=>{
 const state=structuredClone(fixture),p=state.surveys[0].plans[0];p.viewRotationOverride=angle;p.fspRoutes[0].future={retain:true};p.fspRoutes[0].points[0].future='endpoint';
 await start(page,state);await enterMove(page);const before=await model(page),v=await box(page);await hold(page);const end=await point(page,400,380);await page.mouse.move(end.x,end.y,{steps:8});expect(geometry(await model(page))).toEqual(geometry(before));await page.mouse.up();
 const after=await model(page);closeTo(after.cameras[0],400,380);expect(after.fspRoutes[0]).toEqual({...before.fspRoutes[0],points:[{...before.fspRoutes[0].points[0],x:after.cameras[0].x,y:after.cameras[0].y},...before.fspRoutes[0].points.slice(1)]});expect(await box(page)).toBe(v);
});
test('cone is locked in Navigate and only previews/commits from the Move handle',async({page})=>{
 await start(page);const before=await model(page),a=await point(page,350,350);await page.mouse.click(a.x,a.y);await page.locator('#doneDetail').click();
 const from=await point(page,450,350),to=await point(page,450,430);await drag(page,from,to);expect(geometry(await model(page))).toEqual(geometry(before));
 await enterMove(page);const h=await point(page,450,350),end=await point(page,450,430),v=await box(page);await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:10});expect(geometry(await model(page))).toEqual(geometry(before));await page.mouse.up();
 const after=await model(page);expect(Math.abs(after.cameras[0].angle)).toBeGreaterThan(1);expect(after.cameras[0].x).toBe(before.cameras[0].x);expect(after.cameras[0].y).toBe(before.cameras[0].y);expect(after.fspRoutes).toEqual(before.fspRoutes);expect(await box(page)).toBe(v);
});
test('background and backup export during a preview contain committed geometry only',async({page})=>{
 await start(page);await enterMove(page);const before=await model(page);await hold(page);const end=await point(page,420,390);await page.mouse.move(end.x,end.y,{steps:8});
 const download=page.waitForEvent('download');await page.locator('#exportBackup').evaluate(b=>b.click());const d=await download,stream=await d.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);
 const exported=JSON.parse(Buffer.concat(chunks));expect(geometry(exported.surveys[0].plans[0])).toEqual(geometry(before));await page.mouse.up();await flush(page);await page.reload();await page.locator('#continue').click();expect(geometry(await model(page))).toEqual(geometry(before));
});
test('mode and transient previews are not restored after an actual process restart',async({baseURL})=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),profile=await fs.mkdtemp(path.join(os.tmpdir(),'fsp-camera-controller-'));let context;
 const options={baseURL,headless:true,viewport:portrait,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH};try{
 context=await chromium.launchPersistentContext(profile,options);let page=await context.newPage();watch(page);await seed(page);await cameraMode(page);await enterMove(page);const before=await model(page);await hold(page);const end=await point(page,410,380);await page.mouse.move(end.x,end.y,{steps:8});await flush(page);await context.close();context=null;
 context=await chromium.launchPersistentContext(profile,options);page=await context.newPage();watch(page);await page.goto(TARGET);await page.locator('#continue').click();await cameraMode(page);await expect(page.locator('#cameraInteractionMode')).toHaveText('Navigate');expect(geometry(await model(page))).toEqual(geometry(before));
 }finally{if(context)await context.close();await fs.rm(profile,{recursive:true,force:true})}
});

test('camera scope preserves every PR15 application byte outside explicit camera hooks and freezes navigation equations',()=>{require('./helpers/camera-source-boundary').verifyCameraBoundary()});
for(const zoom of [0,3])test(`hold tolerance is measured in CSS pixels at zoom ${zoom}`,async({page})=>{
 await page.setViewportSize(portrait);await seed(page);for(let i=0;i<zoom;i++)await page.locator('#zoomIn').click();await cameraMode(page);await enterMove(page);const before=await model(page),a=await point(page,350,350);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+4,a.y+2);await expect(page.locator('[data-camera-armed]')).toHaveCount(1);expect(geometry(await model(page))).toEqual(geometry(before));await page.mouse.up();
 await expect(page.locator('#detail')).toBeHidden();expect(geometry(await model(page))).toEqual(geometry(before));
});
test('a long stationary Navigate hold never moves a camera or opens Details',async({page})=>{
 await start(page);const before=await model(page),a=await point(page,350,350);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(620);await page.mouse.up();await expect(page.locator('#detail')).toBeHidden();expect(geometry(await model(page))).toEqual(geometry(before));
});
for(const kind of ['second camera','cone cancel'])test(`${kind} cancels cleanly without saving a preview`,async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:portrait,isMobile:true,hasTouch:true});try{
 const page=await context.newPage();watch(page);const state=structuredClone(fixture);state.surveys[0].plans[0].cameras.push({id:'cam-extra',num:'9',type:'Existing',x:650,y:150,angle:0,notes:'preserve'});await seed(page,{state});await cameraMode(page);await enterMove(page);
 if(kind==='cone cancel'){const c=await point(page,350,350);await page.mouse.click(c.x,c.y);await page.locator('#closeDetail').click()}
 const before=await model(page),touch=await touchSession(context,page),a=await point(page,kind==='cone cancel'?450:350,350),b=await point(page,650,150);
 await touch('touchStart',[a]);await expect(page.locator('[data-camera-armed]')).toHaveCount(1);await touch('touchMove',[{x:a.x+25,y:a.y+35}]);await touch('touchStart',[{x:a.x+25,y:a.y+35},b]);await touch('touchEnd',[]);expect(geometry(await model(page))).toEqual(geometry(before));await expect(page.locator('#detail')).toBeHidden();
 }finally{await context.close()}
});
test('New/Existing Add Camera placement retains numbering, appearance and exclusive ownership',async({page})=>{
 await start(page);await enterMove(page);await page.locator('#addCamera').click();await expect(page.locator('#cameraInteractionMode')).toHaveText('Navigate');
 let p=await point(page,250,250);await page.mouse.click(p.x,p.y);let m=await model(page);expect(m.cameras.at(-1)).toMatchObject({num:'3',type:'New'});closeTo(m.cameras.at(-1),250,250);
 await page.locator('#surveyMore').click();await page.getByRole('button',{name:'Existing Camera',exact:true}).click();p=await point(page,150,150);await page.mouse.click(p.x,p.y);m=await model(page);expect(m.cameras.at(-1)).toMatchObject({num:'4',type:'Existing'});
 const color=await page.locator(`[data-cam="${m.cameras.at(-1).id}"] circle[r="13"]`).getAttribute('fill');expect(color).toBe('#2676c8');await page.reload();await page.locator('#continue').click();expect((await model(page)).cameras).toEqual(m.cameras);
});
test('direct equipment and area label exceptions do not pan or start camera drafts',async({page})=>{
 const state=structuredClone(fixture),p=state.surveys[0].plans[0];p.areas=[{id:'move-label',name:'Synthetic area',method:'manual',sqft:100,pos:{x:600,y:200}}];await start(page,state);const before=await model(page),v=await box(page);
 await drag(page,await point(page,800,450),await point(page,750,500));let m=await model(page);closeTo(m.fspRacks[0],750,500);expect(m.fspRoutes[0].points.slice(1,-1)).toEqual(before.fspRoutes[0].points.slice(1,-1));expect(await box(page)).toBe(v);
 const label=page.locator('#surveyScene g[data-area-label="move-label"]');await expect(label).toBeVisible();const r=await label.boundingBox();await drag(page,{x:r.x+r.width/2,y:r.y+r.height/2},{x:r.x+r.width/2+20,y:r.y+r.height/2+15});m=await model(page);expect(m.areas[0].pos).not.toEqual(before.areas[0].pos);expect(m.cameras).toEqual(before.cameras);expect(await box(page)).toBe(v);
});
test('a committed move survives offline reload with connected geometry intact',async({page,context})=>{
 await start(page);await enterMove(page);await context.setOffline(true);await hold(page);const end=await point(page,400,380);await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();const after=await model(page);closeTo(after.cameras[0],400,380);
 await context.setOffline(false);await page.reload();await page.locator('#continue').click();expect(geometry(await model(page))).toEqual(geometry(after));
});
for(const size of [portrait,landscape])test(`Move Done remains reachable after toolbar drag at ${size.width}`,async({page})=>{
 await page.setViewportSize(size);await seed(page);await cameraMode(page);const h=await page.locator('#dragTools').boundingBox();await drag(page,{x:h.x+h.width/2,y:h.y+h.height/2},{x:size.width-80,y:size.height-55});await enterMove(page);
 const r=await page.locator('#floatTools').boundingBox(),done=await page.locator('#surveyDone').boundingBox();expect(r.y+r.height).toBeLessThanOrEqual(done.y+1);await page.locator('#doneMoveCamera').click();await expect(page.locator('#cameraInteractionMode')).toHaveText('Navigate');await expect(page.locator('#survey')).toBeVisible();
});
test('tool switch during a pending hold invalidates its timer and resets to Navigate',async({page})=>{
 await start(page);await enterMove(page);const before=await model(page),a=await point(page,350,350);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.locator('#addCamera').dispatchEvent('click');await page.waitForTimeout(620);await page.mouse.up();await expect(page.locator('[data-camera-armed]')).toHaveCount(0);await expect(page.locator('#cameraInteractionMode')).toHaveText('Navigate');expect(geometry(await model(page))).toEqual(geometry(before));
});
test('all connected routes commit their start together while other routes and metadata stay intact',async({page})=>{
 const state=structuredClone(fixture),p=state.surveys[0].plans[0];p.cameras.push({id:'other-cam',num:'9',type:'New',x:650,y:150,angle:0});
 p.fspRoutes.push({...structuredClone(p.fspRoutes[0]),id:'same-camera-second-route',future:{keep:true}});p.fspRoutes.push({...structuredClone(p.fspRoutes[0]),id:'other-camera-route',cameraId:'other-cam'});
 await start(page,state);await enterMove(page);const before=await model(page);await hold(page);const end=await point(page,410,385);await page.mouse.move(end.x,end.y,{steps:8});expect((await model(page)).fspRoutes).toEqual(before.fspRoutes);await page.mouse.up();const after=await model(page);
 for(const route of before.fspRoutes){const actual=after.fspRoutes.find(r=>r.id===route.id);expect(actual).toEqual(route.cameraId==='cam-1'?{...route,points:[{...route.points[0],x:after.cameras[0].x,y:after.cameras[0].y},...route.points.slice(1)]}:route)}
});
test('tap Details preserves numbering swaps, type and notes across plans',async({page})=>{
 await start(page);const p=await point(page,350,350);await page.mouse.click(p.x,p.y);await page.locator('#detailNumber').fill('2');await page.locator('#detailNotes').focus();await expect(page.locator('#modalTitle')).toHaveText('Swap Camera Numbers');await page.locator('#modalOk').click();
 await page.locator('#detailType [data-camera-type="New"]').click();await page.locator('#detailNotes').fill('Synthetic retained description');await page.locator('#doneDetail').click();const data=await saved(page);expect(data.surveys[0].plans[0].cameras[0]).toMatchObject({num:'2',type:'New',notes:'Synthetic retained description'});expect(data.surveys[0].plans[1].cameras[0].num).toBe('1');
});
test('tap Details preserves camera deletion confirmation and cancellation',async({page})=>{
 await start(page);const before=await model(page),p=await point(page,350,350);await page.mouse.click(p.x,p.y);await page.locator('#deleteCamera').click();await page.locator('#modalCancel').click();expect((await model(page)).cameras).toEqual(before.cameras);
 await page.locator('#deleteCamera').click();await page.locator('#modalOk').click();expect((await model(page)).cameras).toHaveLength(0);const data=await saved(page);expect(data.surveys[0].plans[1].cameras).toEqual(fixture.surveys[0].plans[1].cameras);await expect(page.locator('#detail')).toBeHidden();
});
for(const tool of ['New camera','Existing camera','MDF placement'])test(`entering Move Camera cancels pending ${tool} ownership`,async({page})=>{
 await start(page);const before=await model(page);
 if(tool==='New camera')await page.locator('#addCamera').click();
 else{await page.locator('#surveyMore').click();await page.getByRole('button',{name:tool==='Existing camera'?'Existing Camera':'Add MDF/IDF',exact:true}).click();if(tool==='MDF placement')await page.getByRole('button',{name:'MDF',exact:true}).click()}
 await enterMove(page);await hold(page);await page.mouse.up();const p=await point(page,250,250);await page.mouse.click(p.x,p.y);
 expect(geometry(await model(page))).toEqual(geometry(before));await expect(page.locator('#addCamera')).not.toHaveClass(/\bprimary\b|placing-existing/);
});
test('Add Camera takes ownership from pending equipment placement',async({page})=>{
 await start(page);const before=await model(page);await page.locator('#surveyMore').click();await page.getByRole('button',{name:'Add MDF/IDF',exact:true}).click();await page.getByRole('button',{name:'MDF',exact:true}).click();await page.locator('#addCamera').click();const p=await point(page,250,250);await page.mouse.click(p.x,p.y);const after=await model(page);expect(after.fspRacks).toEqual(before.fspRacks);expect(after.cameras).toHaveLength(before.cameras.length+1);closeTo(after.cameras.at(-1),250,250);
});
test('screen transition clears pending equipment placement before returning to Navigate',async({page})=>{
 await start(page);const before=await model(page);await page.locator('#surveyMore').click();await page.getByRole('button',{name:'Add MDF/IDF',exact:true}).click();await page.getByRole('button',{name:'MDF',exact:true}).click();await page.locator('#surveyDone').click();await cameraMode(page);const p=await point(page,250,250);await page.mouse.click(p.x,p.y);expect((await model(page)).fspRacks).toEqual(before.fspRacks);await expect(page.locator('#cameraInteractionMode')).toHaveText('Navigate');
});
