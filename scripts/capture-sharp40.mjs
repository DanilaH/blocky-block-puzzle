import {spawn} from "node:child_process";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","5173"],{stdio:"ignore"});
await new Promise(r=>setTimeout(r,1000));
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
await page.goto('http://127.0.0.1:5173');
await page.waitForSelector('#app:not([aria-busy="true"])');
await page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');const {newGame}=await import('/src/core/rules.ts');let s=new IndexedSave(),p=(await s.load()).profile;p.tutorialStep=4;p.revision++;p.settings.calm=true;p.game=newGame(32,'sharp');p.game.board=Array.from({length:64},(_,i)=>i%8<5&&Math.floor(i/8)<5?i%6+1:0);await s.write(p)});
await page.reload();await page.waitForSelector('#app:not([aria-busy="true"])');await page.waitForTimeout(600);
await page.screenshot({path:`docs/qa/feel-0.40/sharp-${process.argv[2]??'before'}.png`});
console.log(await page.locator('#board canvas').evaluate(c=>({width:c.width,css:c.getBoundingClientRect().width,dpr:devicePixelRatio})));
await browser.close();

server.kill();
