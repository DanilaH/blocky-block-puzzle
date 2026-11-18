import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='docs/qa/feel-0.19'; await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto('http://127.0.0.1:5187'); await page.locator('#board canvas').waitFor();
await page.evaluate(async()=>{
 const {IndexedSave}=await import('/src/platform/save.ts'); const {newGame}=await import('/src/core/rules.ts');
 const a=new IndexedSave(),p=(await a.load()).profile;p.revision++;p.tutorialStep=4;
 p.game={...newGame(12,'festival-review'),scoringVersion:'festival-v3',streak:3};p.best=10000;p.festivalBest=10000;
 p.game.tray=[0,1,2].map(i=>({shapeId:'S1-0',color:i+1,used:false}));
 for(let x=0;x<7;x++)p.game.board[24+x]=x%6+1;
 await a.write(p);
});
await page.reload(); await page.locator('#board canvas').waitFor();
for(const [w,h] of [[390,844],[320,480],[568,320]]){
 await page.setViewportSize({width:w,height:h}); await page.waitForTimeout(200);
 await page.screenshot({path:`${out}/combo-${w}x${h}.png`});
 console.log(w,h,await page.locator('#board').boundingBox(),await page.locator('#combo-hud').boundingBox());
}
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
await page.locator('.piece').first().click();const b=await page.locator('#board').boundingBox();
await page.locator('#board').click({position:{x:b.width*7.5/8,y:b.height*3.5/8}});
await page.waitForTimeout(1000);await page.screenshot({path:`${out}/empty.png`});
await page.waitForTimeout(2600);
console.log('score',await page.locator('#score').textContent());
await browser.close();
