import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch(),context=await browser.newContext(),page=await context.newPage(),cdp=await context.newCDPSession(page),results=[];
await page.goto('http://127.0.0.1:5173');await page.locator('#board canvas').waitFor();
const ids=await page.evaluate(async()=>(await import('/src/core/rules.ts')).SHAPES.map(s=>s.id));
for(const [width,height,insets] of [[568,320,{top:0,bottom:24,left:24,right:0}],[320,568,{top:24,bottom:24,left:0,right:0}]]){
 await page.setViewportSize({width,height});await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets});
 for(let i=0;i<ids.length;i+=3){const shapes=[0,1,2].map(j=>ids[(i+j)%ids.length]);
 await page.evaluate(async(shapes)=>{const {IndexedSave}=await import('/src/platform/save.ts'),{newGame}=await import('/src/core/rules.ts'),{createProfile}=await import('/src/core/profile.ts');const a=new IndexedSave(),old=await a.load(),p=createProfile(newGame(1,'sizes09'));p.revision=old.profile.revision+1;p.tutorialStep=4;p.game.tray=shapes.map((shapeId,i)=>({shapeId,used:false,color:i+1}));await a.write(p)},shapes);
 await page.reload();await page.locator('#board canvas').waitFor();
 const slots=await page.locator('.piece').evaluateAll(els=>els.map(e=>{const a=e.getBoundingClientRect(),b=e.querySelector('.mini-shape').getBoundingClientRect();return {slot:{x:a.x,y:a.y,width:a.width,height:a.height},shape:{x:b.x,y:b.y,width:b.width,height:b.height},fits:b.x>=a.x-.5&&b.y>=a.y-.5&&b.right<=a.right+.5&&b.bottom<=a.bottom+.5}}));
 results.push({width,height,shapes,slots});if(slots.some(s=>!s.fits))throw Error('shape outside slot');
 }
 await page.screenshot({path:new URL(`shapes-${width}x${height}.png`,import.meta.url).pathname});
}
await fs.writeFile(new URL('shape-results.json',import.meta.url),JSON.stringify(results,null,2));console.log('All 25 shapes fit in each of two compact inset layouts');await browser.close();
