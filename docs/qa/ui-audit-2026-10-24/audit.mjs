import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = new URL('./', import.meta.url).pathname;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});const results={errors:[],layouts:[]};page.on('pageerror',e=>results.errors.push(e.message));
const shot=async n=>{await page.screenshot({path:out+n+'.png'});};
await page.goto('http://127.0.0.1:5173');await page.waitForSelector('#board canvas');
async function fixture(kind='base'){
 await page.evaluate(async kind=>{
 const req=indexedDB.open('blocky-classic',1);await new Promise(r=>req.onsuccess=r);const db=req.result,tx=db.transaction('save','readwrite'),s=tx.objectStore('save'),read=s.get('current');
 read.onsuccess=()=>{const p=read.result;p.game.board=Array(64).fill(0);p.game.tray=[{shapeId:'I5-1',color:1,used:false},{shapeId:'O3-0',color:4,used:false},{shapeId:'S1-0',color:2,used:false}];p.game.score=0;p.game.streak=0;p.game.status='playing';p.hint=null;p.freeHints=3;p.settings.calm=false;
 if(kind==='cross'){p.game.tray=p.game.tray.map(x=>({...x,shapeId:'S1-0'}));for(let i=1;i<8;i++){p.game.board[i]=i%6+1;p.game.board[i*8]=i%6+1;}p.game.board[63]=3;}
 if(kind==='over'){p.game.board=Array(64).fill(2);p.game.status='over';p.game.score=1245;}
 if(kind==='zero')p.freeHints=0;
 if(kind==='big'){p.game.score=1234567;p.best=2345678;}
 p.best=Math.max(p.best,p.game.score);p.revision++;s.put(p,'current');};await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=j;});db.close();
 },kind);await page.reload();await page.waitForSelector('#board canvas');await page.waitForTimeout(120);
}
await fixture();await shot('01-new-game');
for(const [w,h] of [[320,568],[360,640],[390,844],[412,915],[640,360],[844,390],[768,1024],[1024,768]]){
 await page.setViewportSize({width:w,height:h});await page.waitForTimeout(100);
 results.layouts.push(await page.evaluate(()=>{const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};return {viewport:[innerWidth,innerHeight],board:rect('#board'),hint:rect('#hint'),pause:rect('#pause'),tray:rect('#tray'),ad:rect('#ad-slot'),pieces:[...document.querySelectorAll('.mini-shape')].map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height}})};}));
 await shot(`layout-${w}x${h}`);
}
await page.setViewportSize({width:390,height:844});await fixture();
await page.locator('#pause').click();await shot('02-pause');await page.locator('#rules').click();await shot('03-rules');await page.locator('#back-pause').click();await page.locator('#restart').click();await shot('04-restart');await page.locator('#keep-game').click();
// One Enter should select, not place.
await page.locator('#tray button').nth(2).focus();await page.keyboard.press('Enter');await page.waitForTimeout(150);results.keyboardFirstEnterScore=await page.locator('#score').textContent();await shot('05-keyboard-first-enter');
await fixture();await page.locator('#hint').click();await page.waitForTimeout(800);results.hintSelectedSlots=await page.locator('.piece.selected').count();await shot('06-hint');
await fixture('zero');await page.locator('#hint').click();await shot('07-no-hints');
await fixture('over');await shot('08-result');await page.locator('#look-board').click();await shot('09-result-board');
await fixture('big');await shot('10-big-score');
await fixture('cross');await page.locator('#tray button').first().click();await page.locator('#board').click({position:{x:4,y:4}});await shot('11-combo-early');await page.waitForTimeout(200);await shot('12-combo-late');
// Pause immediately after another clear and inspect surviving DOM effects.
await fixture('cross');await page.locator('#tray button').first().click();await page.locator('#board').click({position:{x:4,y:4}});await page.locator('#pause').click();results.pauseBurst=await page.locator('#burst').textContent();results.pauseAnimations=await page.evaluate(()=>document.getAnimations().length);
// Touch geometry: bottom row target, horizontal finger reach.
await fixture();const cdp=await page.context().newCDPSession(page);const rect=await page.locator('#tray button').first().boundingBox();const board=await page.locator('#board').boundingBox();
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:board.x+board.width/2,y:board.y+board.height/2}]});await shot('13-touch-drag');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
results.touch={board,screenH:844,requiredFingerYForBottom:board.y+board.height+board.width/8*1.2};
await browser.close();fs.writeFileSync(out+'measurements.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
