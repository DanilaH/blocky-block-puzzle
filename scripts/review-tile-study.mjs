import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out=process.env.REVIEW_DIR||'/workspace/scratch/fcab71b1aa53/tile-study-review';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();const errors=[];
for(const style of ['before','plastic','enamel','caramel']) {
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 page.on('pageerror',e=>errors.push(style+': '+e.message));
 const url='http://127.0.0.1:5187/'+(style==='before'?'':`?tileStudy=${style}`);
 await page.goto(url);await page.locator('#board canvas').waitFor();await page.waitForFunction(()=>!document.querySelector('#app').inert);
 await page.evaluate(async()=>{
  const {IndexedSave}=await import('/src/platform/save.ts');const {newGame}=await import('/src/core/rules.ts');
  const a=new IndexedSave(),p=(await a.load()).profile;p.revision++;p.tutorialStep=4;p.best=5800;p.festivalBest=5800;
  p.game={...newGame(1234,'material-study'),score:3460,scoringVersion:'festival-v3'};
  p.game.board=[
   0,0,0,0,0,0,0,0,
   0,0,5,5,0,0,0,0,
   0,0,5,5,0,4,4,4,
   2,2,0,0,0,0,4,0,
   2,2,0,3,3,0,0,0,
   0,0,0,3,3,0,6,6,
   1,1,1,0,0,0,6,6,
   1,1,1,0,0,0,0,0];
  p.game.tray=[{shapeId:'L3-0',color:2,used:false},{shapeId:'R6-0',color:4,used:false},{shapeId:'I3-1',color:1,used:false}];
  await a.write(p);
 });
 await page.reload();await page.locator('#board canvas').waitFor();await page.waitForFunction(()=>!document.querySelector('#app').inert);
 await page.waitForTimeout(350);await page.screenshot({path:`${out}/${style}.png`});
 // Same assets in the moving piece, then a legal placement with the real save path.
 await page.locator('[data-slot="0"]').click();await page.locator('#board').click({position:{x:4,y:4}});
 await page.waitForTimeout(400);
 const moves=await page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile.game.moves;});
 if(moves!==1)throw Error(style+' real placement failed');
 if(style!=='before'){
  await page.setViewportSize({width:320,height:568});await page.waitForTimeout(250);await page.screenshot({path:`${out}/${style}-320.png`});
 }
 await page.close();console.log(style,'snapshot and placement OK');
}
await browser.close();if(errors.length)throw Error(errors.join('\n'));
await fs.writeFile(`${out}/checks.json`,JSON.stringify({pageErrors:errors,realPlacements:4,viewports:['390x844 DPR2','320x568 DPR2']},null,2));
