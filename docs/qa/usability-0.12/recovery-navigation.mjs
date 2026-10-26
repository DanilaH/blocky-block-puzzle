import {chromium} from 'playwright';import fs from 'node:fs/promises';
const out=new URL('./',import.meta.url).pathname,b=await chromium.launch(),p=await b.newPage({viewport:{width:320,height:480}});const results=[];
await p.goto('http://127.0.0.1:5188');await p.locator('#board canvas').waitFor();
await p.evaluate(async()=>{const r=indexedDB.open('blocky-classic',1);const db=await new Promise(ok=>r.onsuccess=()=>ok(r.result));const tx=db.transaction('save','readwrite');tx.objectStore('save').put({bad:true},'current');tx.objectStore('save').put({bad:true},'backup');await new Promise(ok=>tx.oncomplete=ok);db.close();});
await p.reload();await p.locator('#recover').waitFor();
async function sample(name){results.push(await p.evaluate(name=>({name,viewport:[innerWidth,innerHeight],scroll:document.documentElement.scrollHeight,scrollY,overflow:getComputedStyle(document.body).overflow,controls:[...document.querySelectorAll('button')].map(e=>{const r=e.getBoundingClientRect();return{id:e.id,text:e.innerText,x:r.x,y:r.y,w:r.width,h:r.height,visible:r.bottom<=innerHeight&&r.y>=0,hit:document.elementFromPoint(r.x+r.width/2,Math.min(innerHeight-1,r.y+r.height/2))===e}})}),name));await p.screenshot({path:out+name+'.png'});}
await sample('damaged-320x480');
await p.setViewportSize({width:568,height:320});await sample('damaged-568x320');
const cdp=await p.context().newCDPSession(p);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y:280}]});
for(const y of [240,180,120,60])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:280,y}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(200);await sample('damaged-landscape-after-swipe');
await p.setViewportSize({width:320,height:480});
await p.locator('#recover').click();await sample('recovery-confirm-320x480');
await p.setViewportSize({width:568,height:320});await sample('recovery-confirm-568x320');
await p.setViewportSize({width:390,height:844});await sample('recovery-confirm-390x844');
await p.locator('#confirm-recovery').click();await p.locator('#board canvas').waitFor();await p.locator('#lesson-skip').click();
for(const [w,h] of [[320,480],[568,320]]){
 await p.setViewportSize({width:w,height:h});await p.locator('#pause').click();await p.locator('#rules').click();await sample(`rules-${w}x${h}`);
 const focus=await p.evaluate(()=>document.activeElement.tagName);await p.keyboard.press('Tab');results.push({name:'rules-focus',viewport:[w,h],before:focus,after:await p.evaluate(()=>document.activeElement.id)});
 await p.keyboard.press('Escape');await p.keyboard.press('Escape');
}
await fs.writeFile(out+'recovery-navigation.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));await b.close();
