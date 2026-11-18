import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const out = new URL('.', import.meta.url).pathname;
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const results={};
async function boot(){await page.goto('http://127.0.0.1:5173');await page.locator('#board canvas').waitFor();}
async function fixture(options={}){await page.evaluate(async options=>{
 const {newGame}=await import('/src/core/rules.ts');
 const {createProfile}=await import('/src/core/profile.ts');
 const {IndexedSave}=await import('/src/platform/save.ts');
 const a=new IndexedSave(),old=await a.load();const p=createProfile(newGame(1234,'audit'));
 p.revision=old.profile.revision+1;p.tutorialStep=4;p.game.tray=[0,1,2].map(i=>({shapeId:'S1-0',used:false,color:i+1}));
 if(options.row){for(let x=1;x<8;x++)p.game.board[x]=3;p.game.board[63]=2; p.game.streak=9;p.game.score=999990;p.best=999995;}
 await a.write(p);
 },options);await page.reload();await page.locator('#board canvas').waitFor();}
async function profile(){return page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile;});}
async function put(slot,x,y){await page.locator('.piece').nth(slot).click();const b=await page.locator('#board').boundingBox();await page.locator('#board').click({position:{x:(x+.4)*b.width/8,y:(y+.4)*b.height/8}});}
await boot();await fixture();
// Delayed durable write: second setting must not silently lie.
await page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');const write=IndexedSave.prototype.write;IndexedSave.prototype.write=async function(p){await new Promise(r=>setTimeout(r,500));return write.call(this,p);};});
await page.locator('#pause').click();await page.locator('#sound').uncheck();await page.locator('#calm').check();await page.waitForTimeout(700);
results.settings={visible:{sound:await page.locator('#sound').isChecked(),calm:await page.locator('#calm').isChecked()},saved:(await profile()).settings};await page.screenshot({path:out+'settings-saved.png'});
await page.reload();await page.locator('#pause').click();results.settings.afterReload={sound:await page.locator('#sound').isChecked(),calm:await page.locator('#calm').isChecked()};
results.layouts=[];
for(const [width,height] of [[320,480],[320,568],[360,640],[390,844],[568,320],[640,360],[844,390],[768,1024]]){
 await page.setViewportSize({width,height});await fixture({row:true});await put(0,0,0);await page.waitForTimeout(200);
 const metrics=await page.evaluate(()=>{const box=id=>{const b=document.querySelector(id).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};return {score:box('#score'),reward:box('#burst'),streak:box('#streak'),hint:box('#hint'),ad:box('#ad-slot'),board:box('#board'),pause:box('#pause'),text:document.querySelector('#burst').textContent};});
 results.layouts.push({width,height,...metrics});await page.screenshot({path:out+`stress-${width}x${height}.png`});
}
await page.setViewportSize({width:390,height:844});await fixture();
// Count both actual renderer frames and Graphics rebuilds.
await page.evaluate(async()=>{const {BoardScene}=await import('/src/game/BoardScene.ts');const p=BoardScene.prototype;const u=p.update,d=p.draw;window.auditPerf={frames:0,draws:0,drawMs:0};p.update=function(...args){window.auditScene=this;if(!this.auditHook){this.auditHook=true;this.game.events.on('postrender',()=>window.auditPerf.frames++);}return u.apply(this,args)};p.draw=function(...args){window.auditScene=this;if(!this.auditHook){this.auditHook=true;this.game.events.on('postrender',()=>window.auditPerf.frames++);}const t=performance.now();window.auditPerf.draws++;const v=d.apply(this,args);window.auditPerf.drawMs+=performance.now()-t;return v;};});
async function measure(label){await page.evaluate(()=>{window.auditPerf={frames:0,draws:0,drawMs:0};});await page.waitForTimeout(2000);results[label]=await page.evaluate(()=>({...window.auditPerf,renderer:window.auditScene.game.renderer.type}));}
await page.setViewportSize({width:391,height:844});await page.waitForTimeout(100);await measure('idle');await page.locator('#hint').click();await page.waitForTimeout(500);await measure('hint');await page.locator('#pause').click();await measure('pause');
results.errors=errors;
await fs.writeFile(out+'results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();
