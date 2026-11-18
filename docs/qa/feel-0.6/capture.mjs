import { chromium } from '@playwright/test';
import { rename } from 'node:fs/promises';
const url=process.argv[2]??'http://127.0.0.1:5173';
const label=process.argv[3]??'after';
const out='docs/qa/feel-0.6';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:'/tmp/blocky06-captures',size:{width:390,height:844}}});
const setup=await context.newPage();await setup.goto(url);await setup.locator('.piece').first().waitFor();
await setup.evaluate(async()=>{
 const {newGame}=await import('/src/core/rules.ts');
 const r=indexedDB.open('blocky-classic',1);await new Promise(ok=>r.onsuccess=ok);
 const tx=r.result.transaction('save','readwrite'),s=tx.objectStore('save'),q=s.get('current');
 q.onsuccess=()=>{const p=q.result;p.tutorialStep=4;p.game=newGame(1234,'showcase');p.best=150;p.hint=null;p.settings.calm=false;p.game.score=100;p.game.moves=12;
 p.game.tray=[{shapeId:'I2-1',color:1,used:false},{shapeId:'I2-1',color:4,used:false},{shapeId:'S1-0',color:2,used:false}];
 for(let y=0;y<4;y++)for(let x=1;x<8;x++)p.game.board[y*8+x]=y+1;
 for(let x=1;x<8;x++)p.game.board[56+x]=3;
 p.revision++;s.put(p,'current')};await new Promise(ok=>tx.oncomplete=ok);r.result.close();
});await setup.close();
const page=await context.newPage();await page.goto(url);await page.locator('#board canvas').waitFor();await page.waitForTimeout(350);
const box=await page.locator('#board').boundingBox();
for(const [slot,y] of [[0,0],[1,2],[2,7]]){
 const a=await page.locator('.piece').nth(slot).boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
 const h=slot===2?1:2;
 await page.mouse.move(box.x+box.width/16,box.y+(y+h/2)*box.height/8,{steps:18});
 await page.waitForTimeout(250);await page.mouse.up();await page.waitForTimeout(200);
 await page.screenshot({path:`${out}/${label}-${slot}.png`});await page.waitForTimeout(1400);
}
const video=page.video();await context.close();await rename(await video.path(),`${out}/${label}.webm`);await browser.close();
