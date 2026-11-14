const { test, expect } = require('@playwright/test');
const { seed, saved, fixture, point, drag } = require('./helpers/app');
test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2.625, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' });
const errors = new WeakMap();
test.beforeEach(async ({ page }) => { const items=[]; errors.set(page,items); page.on('pageerror',e=>items.push(e.message)); });
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
const image = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="white"/></svg>').toString('base64');
async function start(page, viewport, uploaded = true) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    // Visual-only keyboard/browser-chrome simulation; the layout viewport stays unchanged.
    const vv = new EventTarget(); let state = {};
    for (const key of ['height', 'width', 'offsetTop', 'offsetLeft', 'scale']) Object.defineProperty(vv, key, { get: () => state[key] ?? ({ height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 })[key] });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.mobileVisualViewport = values => { state = values; vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll')); };
  });
  const state = structuredClone(fixture); if (uploaded) state.surveys[0].plans[0].image = image;
  await seed(page, { state });
}
async function rect(page, selector) { return page.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; }); }
function separate(a,b) { expect(a.right <= b.left + .5 || b.right <= a.left + .5 || a.bottom <= b.top + .5 || b.bottom <= a.top + .5).toBe(true); }
async function controlHitState(locator) {
  return locator.evaluate(el => {
    const r=el.getBoundingClientRect(),v=visualViewport;
    const point={x:r.left+r.width/2,y:r.top+r.height/2},hit=document.elementFromPoint(point.x,point.y);
    const describe=node=>node?{tag:node.tagName,id:node.id,classes:node.className}:null;
    const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
    const scroll=[];
    for(let parent=el.parentElement;parent;parent=parent.parentElement){
      if(parent.scrollWidth>parent.clientWidth||parent.scrollHeight>parent.clientHeight)scroll.push({element:describe(parent),rect:rect(parent.getBoundingClientRect()),left:parent.scrollLeft,top:parent.scrollTop,width:parent.clientWidth,height:parent.clientHeight,scrollWidth:parent.scrollWidth,scrollHeight:parent.scrollHeight});
    }
    const inViewport=point.x>=v.offsetLeft&&point.x<v.offsetLeft+v.width&&point.y>=v.offsetTop&&point.y<v.offsetTop+v.height;
    return {accessible:inViewport&&el.contains(hit),inViewport,point,rect:rect(r),viewport:{left:v.offsetLeft,top:v.offsetTop,width:v.width,height:v.height},target:describe(el),hit:describe(hit),scroll};
  });
}
async function clickable(page, selector, {timeout=3000}={}) {
  const locator=page.locator(selector);await locator.scrollIntoViewIfNeeded();await expect(locator).toBeVisible();
  const samples=[];
  try {
    // Scroll/paint and visual-viewport updates can settle on separate frames.
    // Wait for the SAME strict center/viewport hit condition, never a substitute point.
    await expect.poll(async()=>{
      const state=await controlHitState(locator);samples.push(state);if(samples.length>12)samples.shift();return state.accessible;
    },{timeout,intervals:[16,32,64,100],message:selector+' center must be inside the visual viewport and hit the control'}).toBe(true);
    await locator.tap({trial:true});
  } catch(error) {
    await test.info().attach('control-hit-'+selector.replace(/[^a-z0-9]/gi,'-'),{body:JSON.stringify({selector,samples},null,2),contentType:'application/json'});
    throw error;
  }
  if(samples.some(state=>!state.accessible))await test.info().attach('control-hit-settled-'+selector.replace(/[^a-z0-9]/gi,'-'),{body:JSON.stringify({selector,samples},null,2),contentType:'application/json'});
}
for (const viewport of [{width:412,height:915},{width:915,height:412},{width:740,height:320}]) {
  test(`editor separates header, workspace and Done at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await start(page, viewport); await page.locator('#editPlan').tap();
    await expect(page.locator('#planCanvas')).toHaveAttribute('data-active-tool','pan');
    separate(await rect(page,'#planCanvas'),await rect(page,'#plans header'));
    separate(await rect(page,'#planTools'),await rect(page,'#drawingDoneBar'));
    await clickable(page,'#plans header [data-go="home"]'); await clickable(page,'#finishEdit');
    expect((await rect(page,'#planCanvas')).height).toBeGreaterThan(100);
    await testInfo.attach('editor-layout', { body: await page.screenshot(), contentType: 'image/png' });
    await page.locator('#finishEdit').tap(); await expect(page.locator('#editPlan')).toBeVisible();
  });
}
test('uploaded More, Measure, Area and Undo are reachable without expanding a hidden control', async ({ page }) => {
  await start(page,{width:360,height:640}); await page.locator('#editPlan').tap();
  for(const id of ['measureWall','areaTool','undo','moreDrawing']) await clickable(page,'#'+id);
  const before = await page.locator('#moreDrawing').textContent(); await page.locator('#moreDrawing').tap(); await expect(page.locator('#moreDrawing')).not.toHaveText(before);
});
test('Cable Routes toolbar cannot cover survey Done on a short landscape phone', async ({ page }) => {
  await start(page,{width:740,height:320}); await page.locator('#toSurvey').tap();
  await page.locator('#surveyMore').tap(); await page.getByRole('button',{name:'Cable Routes',exact:true}).tap();
  if(await page.locator('#modalBack').isVisible()) await page.locator('#modalOk').tap();
  separate(await rect(page,'#fspCableBar'),await rect(page,'#surveyDone'));
  await clickable(page,'#surveyDone'); await clickable(page,'#fspCableDone');
});
test('portrait Area dialog stays in the visual keyboard viewport with reachable input and save', async ({ page }) => {
  await start(page,{width:412,height:915}); await page.locator('#editPlan').tap(); await page.locator('#areaTool').tap();
  await page.getByRole('button',{name:'Enter dimensions',exact:true}).tap(); await page.getByRole('button',{name:'L-shaped',exact:true}).tap();
  await page.locator('#manualWidth').focus(); await page.evaluate(()=>mobileVisualViewport({height:360,offsetTop:25}));
  await expect.poll(async()=> (await rect(page,'#modalBack .modal')).bottom).toBeLessThanOrEqual(385);
  await clickable(page,'#manualWidth'); await page.locator('#manualWidth').fill('100');
  await clickable(page,'#modalOk'); await page.locator('#modalCancel').tap();
});

function geometry(state) { return state.surveys.map(s => s.plans.map(p => Object.fromEntries(['id','image','walls','dimensions','areas','cameras','fspRacks','fspRoutes'].map(k=>[k,p[k]])))); }
async function safeArea(page, {top=0,right=0,bottom=0,left=0}={}) {
  await page.evaluate(values=>{for(const [key,value] of Object.entries(values))document.documentElement.style.setProperty('--fsp-safe-'+key,value+'px'); window.dispatchEvent(new Event('resize'));},{top,right,bottom,left});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
}
async function inside(page,selector,bounds) {
  const r=await rect(page,selector); expect(r.left).toBeGreaterThanOrEqual(bounds.left-.5); expect(r.top).toBeGreaterThanOrEqual(bounds.top-.5);
  expect(r.right).toBeLessThanOrEqual(bounds.right+.5); expect(r.bottom).toBeLessThanOrEqual(bounds.bottom+.5);
}
for(const uploaded of [false,true]) {
  test(`${uploaded?'uploaded':'drawn'} navigation survives rotation, short browser viewport and safe insets without changing geometry`,async({page})=>{
    await start(page,{width:412,height:915},uploaded); const before=geometry(await saved(page));
    await page.locator('#editPlan').tap();
    for(const viewport of [{width:915,height:412},{width:640,height:280},{width:412,height:915}]) {
      await page.setViewportSize(viewport); await safeArea(page,{top:18,left:24,right:24,bottom:16});
      for(const selector of ['#plans header','#planTools','#drawingDoneBar','#planCanvas']) await inside(page,selector,{left:24,top:18,right:viewport.width-24,bottom:viewport.height-16});
      separate(await rect(page,'#planCanvas'),await rect(page,'#plans header')); separate(await rect(page,'#planTools'),await rect(page,'#drawingDoneBar'));
      await clickable(page,'#finishEdit'); await clickable(page,'#plans header [data-go="home"]');
    }
    await page.evaluate(()=>mobileVisualViewport({height:550,offsetTop:20,width:390,offsetLeft:10}));
    await expect.poll(async()=> (await rect(page,'#drawingDoneBar')).bottom).toBeLessThanOrEqual(554);
    await clickable(page,'#finishEdit');
    expect(geometry(await saved(page))).toEqual(before);
    await page.evaluate(()=>mobileVisualViewport({})); await page.locator('#finishEdit').tap();
    // Done retains its existing auto-area recalculation (including regenerated derived area IDs).
    const completed=geometry(await saved(page));
    await page.reload(); await page.locator('#continue').tap(); expect(geometry(await saved(page))).toEqual(completed);
    separate(await rect(page,'#planCanvas'),await rect(page,'#plans header'));
  });
}

test('new empty Draw Plan keeps Back and Done actionable without making changes',async({page})=>{
  await start(page,{width:740,height:320},false); await page.locator('#addPlan').tap(); await page.getByRole('button',{name:'Draw Plan',exact:true}).tap();
  await clickable(page,'#plans header [data-go="home"]'); await clickable(page,'#finishEdit');
  await page.locator('#finishEdit').tap();
  const state=await saved(page),s=state.surveys[0],p=s.plans.find(p=>p.id===s.activePlan); expect(p.walls).toEqual([]); expect(p.confirmed).toBe(true);
  await page.locator('#editPlan').tap(); await page.locator('#plans header [data-go="home"]').tap(); await expect(page.locator('#home')).toBeVisible();
});

test('toolbar touch scrolling, collapse, restore and dragging leave navigation unobstructed',async({page,context})=>{
  await start(page,{width:360,height:640}); await page.locator('#editPlan').tap(); const before=geometry(await saved(page));
  const b=await rect(page,'#planTools'),cdp=await context.newCDPSession(page),y=b.top+b.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.right-15,y,id:1}]});
  for(let x=b.right-40;x>b.left+40;x-=30)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(await page.locator('#planTools').evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  await page.locator('#planTools').evaluate(el=>new Promise(resolve=>{let previous=el.scrollLeft,stable=0;function frame(){const next=el.scrollLeft;stable=next===previous?stable+1:0;previous=next;if(stable>=8)resolve();else requestAnimationFrame(frame)}frame()}));
  await page.locator('#fspToggleTools').tap(); await expect(page.locator('#planTools')).toHaveClass(/fsp-collapsed/);
  await clickable(page,'#finishEdit'); await page.locator('#fspToggleTools').tap();
  await page.locator('#areaTool').tap(); await page.locator('#modalOk').tap();
  await page.locator('#fspDragTools').scrollIntoViewIfNeeded(); const h=await page.locator('#fspDragTools').boundingBox();
  await drag(page,{x:h.x+h.width/2,y:h.y+h.height/2},{x:2,y:2});
  separate(await rect(page,'#planTools'),await rect(page,'#plans header')); separate(await rect(page,'#planTools'),await rect(page,'#drawingDoneBar'));
  await clickable(page,'#plans header [data-go="home"]'); await clickable(page,'#finishEdit');
  await page.setViewportSize({width:640,height:280}); await clickable(page,'#measureWall'); await clickable(page,'#undo');
  expect(geometry(await saved(page))).toEqual(before);
});

test('camera toolbar stays clear of rotate and Done after dragging and viewport changes',async({page})=>{
  await start(page,{width:740,height:320}); await page.locator('#toSurvey').tap(); const before=geometry(await saved(page));
  for(const target of [{x:1,y:1},{x:739,y:319}]) {
    const h=await page.locator('#dragTools').boundingBox(); await drag(page,{x:h.x+h.width/2,y:h.y+h.height/2},target);
    separate(await rect(page,'#floatTools'),await rect(page,'#surveyDone')); separate(await rect(page,'#floatTools'),await rect(page,'#rotateSurveyView'));
    await clickable(page,'#addCamera'); await clickable(page,'#surveyMore'); await clickable(page,'#surveyDone');
  }
  await page.setViewportSize({width:640,height:280}); await safeArea(page,{left:24,right:24,top:12,bottom:12});
  await inside(page,'#floatTools',{left:24,right:616,top:12,bottom:268});
  await page.locator('#minTools').tap(); await clickable(page,'#restoreTools'); await page.locator('#restoreTools').tap();
  await page.locator('#surveyMore').tap(); await page.getByRole('button',{name:'Cable Routes',exact:true}).tap();
  if(await page.locator('#modalBack').isVisible())await page.locator('#modalOk').tap();
  await page.locator('#fspCableDone').tap(); await page.locator('#surveyDone').tap(); await expect(page.locator('#plans')).toBeVisible();
  expect(geometry(await saved(page))).toEqual(before);
});

for(const viewport of [{width:412,height:915},{width:915,height:412}]) {
  test(`Area inputs and save stay clickable with visual keyboard at ${viewport.width}x${viewport.height}`,async({page})=>{
    await start(page,viewport); await page.locator('#editPlan').tap(); await safeArea(page,{left:24,right:24,top:12,bottom:12});
    await page.locator('#areaTool').tap(); await page.getByRole('button',{name:'Enter dimensions',exact:true}).tap(); await page.getByRole('button',{name:'L-shaped',exact:true}).tap();
    await page.locator('#manualWidth').focus(); await page.evaluate(()=>mobileVisualViewport({height:250,offsetTop:20}));
    await expect.poll(async()=> (await rect(page,'#modalBack .modal')).bottom).toBeLessThanOrEqual(258);
    for(const [id,value] of Object.entries({manualWidth:'100',manualHeight:'60',manualCutWidth:'40',manualCutHeight:'20'})) {
      await clickable(page,'#'+id); await page.locator('#'+id).fill(value);
    }
    await clickable(page,'#modalOk'); await page.locator('#modalOk').tap();
    await page.evaluate(()=>mobileVisualViewport({}));
    const p=(await saved(page)).surveys[0].plans[0]; expect(p.areas.find(a=>a.kind==='manual-l')).toMatchObject({width:100,height:60,cutWidth:40,cutHeight:20});
    await page.locator('#finishEdit').tap(); await page.reload(); await page.locator('#continue').tap(); expect((await saved(page)).surveys[0].plans[0].areas).toEqual(p.areas);
  });
}

test('measurement endpoint Cancel/Done and distance input remain accessible in short landscape',async({page})=>{
  await start(page,{width:740,height:320}); await page.locator('#editPlan').tap(); await safeArea(page,{left:24,right:24,top:12,bottom:12});
  const before=geometry(await saved(page));
  await page.locator('[data-overlay-dimension="0"]').first().dispatchEvent('click');
  await clickable(page,'#dimensionCancel'); await clickable(page,'#dimensionPositionDone');
  await page.locator('#dimensionCancel').tap(); await clickable(page,'#finishEdit'); expect(geometry(await saved(page))).toEqual(before);
  await page.locator('[data-overlay-dimension="0"]').first().dispatchEvent('click'); await page.locator('#dimensionPositionDone').tap();
  await page.locator('#oDistance').focus(); await page.evaluate(()=>mobileVisualViewport({height:210,offsetTop:15}));
  await expect.poll(async()=> (await rect(page,'#modalBack .modal')).bottom).toBeLessThanOrEqual(213);
  await clickable(page,'#oDistance'); await page.locator('#oDistance').fill('100'); await clickable(page,'#modalOk'); await page.locator('#modalOk').tap();
  await page.evaluate(()=>mobileVisualViewport({})); expect(geometry(await saved(page))).toEqual(before);
});

test('Camera Details keeps input, Close and Done accessible above the keyboard',async({page,context})=>{
  await start(page,{width:740,height:320}); await page.locator('#toSurvey').tap();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const before=geometry(await saved(page)),camera=await point(page,350,350),cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:camera.x,y:camera.y,id:1}]});
  await expect(page.locator('#detail')).toBeVisible(); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('#detailNotes').focus(); await page.evaluate(()=>mobileVisualViewport({height:210,offsetTop:18}));
  await expect.poll(async()=> (await rect(page,'#detail')).bottom).toBeLessThanOrEqual(228);
  await clickable(page,'#detailNotes'); await page.locator('#detailNotes').fill('Synthetic mobile keyboard note');
  await clickable(page,'#closeDetail'); await clickable(page,'#doneDetail'); await page.locator('#doneDetail').tap();
  await page.evaluate(()=>mobileVisualViewport({})); const after=geometry(await saved(page));
  expect(after[0][0].walls).toEqual(before[0][0].walls); expect(after[0][0].fspRoutes).toEqual(before[0][0].fspRoutes);
  expect(after[0][0].cameras[0]).toMatchObject({...before[0][0].cameras[0],notes:'Synthetic mobile keyboard note'});
});

// A fully visible control can still be underneath a sticky sibling. Native
// scrollIntoViewIfNeeded does not treat that sibling as viewport clipping.
test('left-edge editor controls are not occluded by the collapse button',async({page})=>{
  await start(page,{width:360,height:640});await page.locator('#editPlan').tap();
  await page.locator('#planTools').evaluate(bar=>{
    const target=document.querySelector('#areaTool').getBoundingClientRect(),r=bar.getBoundingClientRect();
    bar.scrollLeft+=target.left-(r.left+12);
  });
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await clickable(page,'#areaTool');
  await page.locator('#areaTool').tap();await expect(page.locator('#modalTitle')).toHaveText('Calculate Area — Uploaded Plan');
});

// Strict hit checks must reject persistent occlusion, while waiting for a
// transient browser/layout obstruction to clear without a forced click.
async function coverControl(page,selector){
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect(),cover=document.createElement('div');cover.id='test-control-occluder';
    Object.assign(cover.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',background:'red',zIndex:'2147483647'});document.body.append(cover);
  });
}
test('reachability diagnostics reject a persistent control occluder',async({page})=>{
  await start(page,{width:360,height:640});await page.locator('#editPlan').tap();await coverControl(page,'#areaTool');
  const before=await controlHitState(page.locator('#areaTool'));expect(before.inViewport).toBe(true);expect(before.hit.id).toBe('test-control-occluder');
  await expect(clickable(page,'#areaTool',{timeout:250})).rejects.toThrow('center must be inside the visual viewport and hit the control');
  expect((await controlHitState(page.locator('#areaTool'))).accessible).toBe(false);
  await page.locator('#test-control-occluder').evaluate(el=>el.remove());
  await clickable(page,'#areaTool');await page.locator('#areaTool').tap();await expect(page.locator('#modalTitle')).toHaveText('Calculate Area — Uploaded Plan');
});
test('reachability waits for transient obstruction without relaxing the hit assertion',async({page})=>{
  await start(page,{width:360,height:640});await page.locator('#editPlan').tap();await coverControl(page,'#areaTool');
  expect((await controlHitState(page.locator('#areaTool'))).accessible).toBe(false);
  await page.evaluate(()=>setTimeout(()=>document.querySelector('#test-control-occluder')?.remove(),500));
  await clickable(page,'#areaTool');expect((await controlHitState(page.locator('#areaTool'))).accessible).toBe(true);
  await page.locator('#areaTool').tap();await expect(page.locator('#modalTitle')).toHaveText('Calculate Area — Uploaded Plan');
});
