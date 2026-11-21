const {expect}=require('@playwright/test');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const modeControls='<div id="cameraActions" style="display:flex;gap:5px"><button id="addCamera">+ Camera</button><button id="moveCameraMode" type="button" aria-pressed="false">Move Camera</button></div>';
function normalizeCameraChanges(s){
 s=s.replace(modeControls,'<button id="addCamera">+ Camera</button>');
 s=s.replace(" setCameraInteractionMode('pan');\n cancelSurveyPlacement();\n lastType=type;",' lastType=type;');
 s=s.replace('for(const originalCamera of plan.cameras){const c=cameraForDisplay(originalCamera);const g=','for(const c of plan.cameras){const g=');
 s=s.replace("if(cameraDraft?.camera===originalCamera)el('circle',{cx:c.x,cy:c.y,r:27,fill:'none',stroke:'#22c55e','stroke-width':4,'vector-effect':'non-scaling-stroke','pointer-events':'none','data-camera-armed':c.id},g);",'');
 const a=s.includes('// Camera interaction state is transient:')?s.indexOf('// Camera interaction state is transient:'):s.indexOf('function bindSurvey(){'),b=s.indexOf('function detailViewportBounds()',a);
 expect(a).toBeGreaterThan(-1);expect(b).toBeGreaterThan(a);s=s.slice(0,a)+'/* camera controller */\n'+s.slice(b);
 s=s.replace('surveyToolOwnsPointer=()=>cableMode||!!placingRack;\n','');
 s=s.replace('cancelSurveyPlacement=()=>{placingRack=false};\n','');
 s=s.replace("function enter(){if(!plan)return;setCameraInteractionMode('pan');cableMode=true;",'function enter(){if(!plan)return;cableMode=true;');
 s=s.replace("function startRack(type){setCameraInteractionMode('pan');if(screen!=='survey')show('survey');","function startRack(type){if(screen!=='survey')show('survey');");
 s=s.replace(' if(!cameraDraft)for(const route of routes()){',' for(const route of routes()){');
 return s.replace(' const routesNow=routes().map(routeForDisplay),show=cableMode||cableVisible;',' const routesNow=routes(),show=cableMode||cableVisible;');
}
const hash=s=>createHash('sha256').update(s).digest('hex');
function verifyCameraBoundary(){
 const s=readFileSync('development/index.html','utf8');
 expect(hash(normalizeCameraChanges(s))).toBe('fdcfd71cd94000d44ac663235e76b5433b3b2f6c742148be02c925f076d86ac1');
 // Preserve the exact existing survey navigation equations, not a reimplementation.
 const a=s.indexOf('  const r=svg.getBoundingClientRect();\n  if(touches.size===2&&pinchState){'),b=s.indexOf('\n }\n function move(e)',a);
 expect(a).toBeGreaterThan(-1);expect(b).toBeGreaterThan(a);expect(hash(s.slice(a,b))).toBe('7aaf60132aa7abbc371a8f9ea0f54d9e3f0cb9557e1542635adb8b51c54ac613');
 expect(s).toContain('const desired=Math.atan2(p.y-g.c.y,p.x-g.c.x)*180/Math.PI;\n   const delta=((desired-g.c.angle+540)%360)-180;\n   g.c.angle+=Math.max(-5,Math.min(5,delta*.22));');
 expect(s).toContain('function scenePoint(x,y){const p=svg.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(svg.getScreenCTM().inverse())}');
 expect(s).toContain('const t=[...touches.values()],mid={x:(t[0].x+t[1].x)/2,y:(t[0].y+t[1].y)/2};pinchState={distance:Math.max(1,Math.hypot(t[0].x-t[1].x,t[0].y-t[1].y)),mid,anchor:scenePoint(mid.x,mid.y),box:getViewBox(svg)};pan=null');
}
module.exports={normalizeCameraChanges,verifyCameraBoundary};
