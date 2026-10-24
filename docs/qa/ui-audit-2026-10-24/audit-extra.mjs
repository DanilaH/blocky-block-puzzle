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

await page.setViewportSize({width:320,height:568});await fixture();await shot('14-small-fresh');
await page.locator('#pause').click();await page.setViewportSize({width:640,height:360});await shot('15-landscape-pause');await page.locator('#rules').click();await shot('16-landscape-rules');
await page.setViewportSize({width:390,height:844});await fixture();
await page.locator('#tray button').nth(2).click();await page.locator('#board').click({position:{x:4,y:4}});
await page.locator('#tray button').nth(1).click();await page.locator('#board').click({position:{x:4,y:4}});
results.invalidTap={selectedClass:await page.locator('.piece.selected').count(),scoreBefore:await page.locator('#score').textContent()};
await shot('17-invalid-tap');await page.locator('#board').click({position:{x:150,y:150}});results.invalidTap.scoreAfterValidTap=await page.locator('#score').textContent();
await fixture('cross');await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForSelector('#board canvas');await page.locator('#tray button').first().click();await page.locator('#board').click({position:{x:4,y:4}});await shot('18-calm-clear');
await page.setViewportSize({width:320,height:568});await fixture('big');await shot('19-small-big-score');
await browser.close();fs.writeFileSync(out+'extra-measurements.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
