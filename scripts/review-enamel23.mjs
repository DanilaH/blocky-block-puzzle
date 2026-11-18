import {createServer} from 'vite';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='docs/qa/enamel-0.23';await fs.mkdir(out,{recursive:true});
const s=await createServer({server:{host:'127.0.0.1',port:5187,strictPort:true}});await s.listen();
const browser=await chromium.launch();
try {
 const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5187/?themeSeries=0');await p.locator('#board canvas').waitFor();
 await p.waitForFunction(()=>!document.querySelector('#app').inert);
 await p.evaluate(async()=>{
  const {IndexedSave}=await import('/src/platform/save.ts');const {newGame}=await import('/src/core/rules.ts');
  const a=new IndexedSave(),p=(await a.load()).profile;p.revision++;p.tutorialStep=4;p.best=5800;p.festivalBest=5800;
  p.game={...newGame(1234,'enamel-23'),moves:10,score:3460,streak:3,scoringVersion:'festival-v3'};
  p.game.board=[0,0,0,0,0,0,0,0,0,0,5,5,0,0,0,0,0,0,5,5,0,4,4,4,2,2,0,0,0,0,4,0,2,2,0,3,3,0,0,0,0,0,0,3,3,0,6,6,1,1,1,0,0,0,6,6,1,1,1,0,0,0,0,0];
  p.game.tray=[{shapeId:'L3-0',color:2,used:false},{shapeId:'R6-0',color:4,used:false},{shapeId:'I3-1',color:1,used:false}];await a.write(p);
 });
 await p.reload();await p.locator('#theme-preview').waitFor();
 for(const stage of [0,3,6,10,15,20,30,40,50,75,100]) {
  // DEV zero means actual saved series, so reset it for the base screenshot.
  if(stage===0 || stage===3) {
   await p.evaluate(async streak=>{const {IndexedSave}=await import('/src/platform/save.ts');const a=new IndexedSave(),q=(await a.load()).profile;q.revision++;q.game.streak=streak;await a.write(q);},stage);
   await p.reload();await p.locator('#theme-preview').waitFor();
  }
  await p.locator('#theme-preview').selectOption(String(stage));await p.waitForTimeout(2000);
  await p.screenshot({path:`${out}/theme-${stage}.png`});
 }
 await p.locator('#theme-preview').selectOption('3');await p.setViewportSize({width:568,height:320});await p.waitForTimeout(2000);await p.screenshot({path:out+'/landscape.png'});
 if(errors.length)throw Error(errors.join('\n'));
 await browser.close();
 process.env.CAPTURE_DIR='/workspace/scratch/enamel23-capture/';process.env.CAPTURE_VERSION='enamel23';process.env.CAPTURE_KIND='sequence';
 await import('./record-tile-study.mjs');
}finally {await browser.close();await s.close();}
