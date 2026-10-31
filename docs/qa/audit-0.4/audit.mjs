import { chromium } from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const out='docs/qa/audit-0.4';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();const report={errors:[],sizes:[],states:{}};
page.on('pageerror',e=>report.errors.push(e.message));
async function setup(kind='normal'){
 await page.goto('http://127.0.0.1:5173');await page.locator('#tray button').first().waitFor();
 await page.evaluate(async kind=>{
  const {newGame}=await import('/src/core/rules.ts');const {dayKey}=await import('/src/core/profile.ts');
  const r=indexedDB.open('blocky-classic',1);await new Promise(resolve=>r.onsuccess=resolve);
  const db=r.result,tx=db.transaction('save','readwrite'),s=tx.objectStore('save'),read=s.get('current');
  read.onsuccess=()=>{const p=read.result;p.game=newGame(1234,p.game.gameId);p.hint=null;p.best=3602;p.freeHints=3;p.earnedHints=0;p.settings.calm=false;
   p.game.score=480;p.game.moves=12;p.game.tray=[{shapeId:'O2-0',color:1,used:false},{shapeId:'S1-0',color:2,used:false},{shapeId:'I3-0',color:6,used:false}];
   p.game.board=[5,5,0,0,0,3,6,6,5,5,2,0,0,3,3,6,0,2,2,0,0,0,0,6,0,0,0,0,0,0,0,0,1,1,1,0,0,4,4,4,6,6,6,0,0,3,3,3,0,0,0,0,0,0,0,0,2,2,0,0,0,4,4,0];
   if(kind==='empty'){p.game.board=Array(64).fill(0);p.game.moves=0;p.game.score=0;}
   if(kind==='large'){p.game.score=1234567;p.best=9876543;p.game.streak=123;}
   if(kind==='no-hints'){p.freeHints=0;p.freeDay=dayKey();}
   if(kind==='record-fast'){
    p.game.board=Array(64).fill(0);for(let y=0;y<4;y++)for(let x=1;x<8;x++)p.game.board[y*8+x]=(y%6)+1;p.game.board[63]=3;
    p.game.tray=[{shapeId:'I2-1',color:1,used:false},{shapeId:'I2-1',color:2,used:false},{shapeId:'S1-0',color:6,used:false}];p.game.score=100;p.best=150;
   }
   if(kind==='last-clear'){
    p.game.board=Array.from({length:64},(_,i)=>((i%8)+Math.floor(i/8))%2?3:0);
    for(let i=1;i<8;i++)p.game.board[i]=1;
    p.game.tray=[{shapeId:'S1-0',color:1,used:false},{shapeId:'O3-0',color:2,used:false},{shapeId:'O3-0',color:6,used:false}];
   }
   p.revision++;s.put(p,'current');};
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
 },kind);
 await page.reload();await page.locator('#board canvas').waitFor();await page.waitForTimeout(180);
}
async function shot(name){await page.screenshot({path:`${out}/${name}.png`})}
async function boxes(){return page.evaluate(()=>Object.fromEntries(['board','tray','hint','pause','score','best','ad-slot','toast','streak','burst'].map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return[id,{x:r.x,y:r.y,w:r.width,h:r.height,visible:!!e.getClientRects().length,text:e.textContent}]})))}
await setup();
for(const [width,height] of [[320,568],[360,640],[390,844],[412,915],[768,1024],[568,320],[640,360],[844,390],[1024,768]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(150);report.sizes.push({width,height,boxes:await boxes()});await shot(`layout-${width}x${height}`);
}
await page.setViewportSize({width:390,height:844});await setup('empty');await shot('empty');
await setup('normal');const cdp=await context.newCDPSession(page);const a=await page.locator('.piece').first().boundingBox(),b=await page.locator('#board').boundingBox();
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height*.68}]});await page.waitForTimeout(180);await shot('touch-drag');
report.states.drag=await page.evaluate(()=>({floatingVisible:!document.querySelector('#floating').hidden,sourceOpacity:getComputedStyle(document.querySelector('.piece.selected .mini-shape')).opacity,sourceVisible:!!document.querySelector('.piece.selected .mini-shape').getClientRects().length}));
await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
await page.setViewportSize({width:568,height:320});await setup('no-hints');await page.locator('#hint').click();await shot('landscape-no-hints');report.states.noHints=await boxes();
await page.locator('#pause').click();await shot('landscape-pause');await page.locator('#rules').click();await shot('landscape-rules');
await page.setViewportSize({width:320,height:568});await setup('large');await page.locator('.piece').nth(1).click();await page.locator('#board').click({position:{x:110,y:8}});await shot('large-score');report.states.large=await boxes();
await page.setViewportSize({width:390,height:844});await setup('last-clear');
await page.evaluate(()=>{window.auditEvents=[];new MutationObserver(()=>window.auditEvents.push({at:performance.now(),open:document.querySelector('dialog').open,burst:document.querySelector('#burst').textContent})).observe(document.querySelector('dialog'),{attributes:true,attributeFilter:['open']})});
await page.locator('.piece').first().click();await page.locator('#board').click({position:{x:4,y:4}});await page.waitForTimeout(30);await shot('final-clear-result');
report.states.lastClear=await page.evaluate(()=>({open:document.querySelector('dialog').open,burst:document.querySelector('#burst').textContent,animations:document.getAnimations().length,events:window.auditEvents}));
await page.locator('#look-board').click();await shot('final-clear-board');
await setup('record-fast');
const br=await page.locator('#board').boundingBox();
await page.locator('.piece').first().click();await page.locator('#board').click({position:{x:4,y:4}});
await page.waitForFunction(()=>document.querySelector('#score').textContent==='142');const firstReward=await page.locator('#burst').textContent();
await page.locator('.piece').nth(1).click();await page.locator('#board').click({position:{x:4,y:br.width*2/8+4}});
await page.waitForFunction(()=>document.querySelector('#score').textContent==='194');report.states.recordFast={firstReward,secondReward:await page.locator('#burst').textContent(),score:await page.locator('#score').textContent(),best:await page.locator('#best').textContent()};await shot('record-suppressed');
await writeFile(`${out}/measurements.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
