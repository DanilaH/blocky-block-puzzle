// Actual touch input from seeded empty board. No injected mid-game deals.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const out=process.env.AUDIT_OUT||'/tmp/browser44';await fs.mkdir(out,{recursive:true});
const server=await createServer({server:{port:5196,host:'127.0.0.1',strictPort:true}});await server.listen();
const browser=await chromium.launch();const results=[];
try {
for(const seed of [1777,3554]){
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5196');await page.locator('#lesson-skip').click();
await page.evaluate(async seed=>{const {IndexedSave}=await import('/src/platform/save.ts'),{newGame}=await import('/src/core/rules.ts');const s=new IndexedSave(),p=(await s.load()).profile;p.revision++;p.tutorialStep=4;delete p.metrics;p.hint=null;p.game={...newGame(seed,'touch-audit-'+seed,'flow-v4'),scoringVersion:'festival-v4',seriesBonusVersion:1};p.settings.calm=false;await s.write(p);},seed);
await page.reload();await page.waitForFunction(()=>!document.querySelector('#app').inert);
const cdp=await context.newCDPSession(page);const events=[];
const saved=()=>page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile;});
for(let i=0;i<90;i++){
const move=await page.evaluate(async()=>{const R=await import('/src/core/rules.ts'),{IndexedSave}=await import('/src/platform/save.ts'),{makePlanner}=await import('/scripts/audit-planner38.mjs');const g=(await new IndexedSave().load()).profile.game;if(g.status!=='playing')return null;const m=makePlanner(R)(g),s=R.shapeById(g.tray[m.slot].shapeId),r=R.place(g.board,s,m.x,m.y);return {...m,w:s.width,h:s.height,revision:g.revision,lines:r.lines,allClear:r.board.every(c=>!c),expected:R.applyMove(g,m,g.revision).state};});
if(!move)break;
const b=await page.locator('#board').boundingBox(),p=await page.locator(`[data-slot="${move.slot}"]`).boundingBox();
const from={x:p.x+p.width/2,y:p.y+p.height/2},to={x:b.x+(move.x+move.w/2)*b.width/8,y:b.y+(move.y+move.h+1.2)*b.width/8};
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
for(let n=1;n<=5;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*n/5,y:from.y+(to.y-from.y)*n/5,id:1}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForFunction(async rev=>{const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile.game.revision>rev;},move.revision,{timeout:6000});
const after=await saved();
for(const key of ['board','tray','score','rngState','moves'])if(JSON.stringify(after.game[key])!==JSON.stringify(move.expected[key]))throw Error(`Mismatch ${seed} ${i} ${key}`);
events.push({move:i+1,lines:move.lines,allClear:move.allClear,score:after.game.score,theme:after.wardrobe?.selected??0});
if(move.allClear||i===29||i===89)await page.screenshot({path:`${out}/${seed}-${i+1}.png`});
if(i===29||i===59){await page.locator('#pause').click();await page.locator('#resume').click();const before=(await saved()).game;await page.reload();await page.waitForFunction(()=>!document.querySelector('#app').inert);if(JSON.stringify((await saved()).game)!==JSON.stringify(before))throw Error('Reload changed game');}
// Deliberately start next move while reward cosmetics may still be alive.
await page.waitForTimeout(100);
}
await page.waitForTimeout(2200);const final=await saved();const displayed=await page.locator('#score').textContent();if(final.game.status==='playing'&&Number(displayed.replace(/\D/g,''))!==final.game.score)throw Error('HUD did not settle');
results.push({seed,events,errors,final:{moves:final.game.moves,score:final.game.score,status:final.game.status},displayed});await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({seed,moves:events.length,clears:events.filter(e=>e.allClear).length,errors,score:final.game.score}));await context.close();
}
}finally{await browser.close();await server.close();}
