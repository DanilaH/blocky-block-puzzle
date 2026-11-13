// Sequential same-browser local diagnostic, not a physical Android benchmark.
import {createServer} from 'vite';import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch(),results=[];
try {
 for(const [name,root] of [['layered','/tmp/blocky23-before'],['shared-texture',process.cwd()]]) {
  const s=await createServer({root,server:{host:'127.0.0.1',port:5187,strictPort:true}});await s.listen();
  try {
   const p=await browser.newPage({viewport:{width:390,height:844}});
   await p.goto('http://127.0.0.1:5187');await p.locator('#board canvas').waitFor();await p.waitForFunction(()=>!document.querySelector('#app').inert);
   await p.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');const {newGame}=await import('/src/core/rules.ts');const a=new IndexedSave(),q=(await a.load()).profile;q.revision++;q.tutorialStep=4;q.best=10000;q.festivalBest=10000;q.game=newGame(1234,'frame-bench');q.game.scoringVersion='festival-v3';q.game.tray=[0,1,2].map(i=>({shapeId:'S1-0',color:i+1,used:false}));for(let x=0;x<7;x++)q.game.board[24+x]=x%6+1;q.game.board[56]=3;await a.write(q);});
   await p.reload();await p.waitForFunction(()=>!document.querySelector('#app').inert);await p.locator('.piece').first().click();
   await p.evaluate(()=>{document.querySelector('#board').addEventListener('pointerup',()=>{window.benchDone=new Promise(resolve=>{const samples=[];const start=performance.now();let last=start;const step=now=>{samples.push(now-last);last=now;if(now-start<3000)requestAnimationFrame(step);else resolve({samples,elapsed:now-start});};requestAnimationFrame(step);});},{once:true});});
   const b=await p.locator('#board').boundingBox();await p.mouse.click(b.x+b.width*7.5/8,b.y+b.height*3.5/8);
   const r=await p.evaluate(()=>window.benchDone);const ordered=r.samples.slice(1).sort((a,b)=>a-b);
   results.push({name,frames:ordered.length,elapsedMs:r.elapsed,medianMs:ordered[Math.floor(ordered.length*.5)],p95Ms:ordered[Math.floor(ordered.length*.95)],framesOver33ms:ordered.filter(x=>x>33.4).length});
   await p.close();
  }finally{await s.close();}
 }
}finally{await browser.close();}
await fs.writeFile('docs/qa/enamel-0.23/local-frame-times.json',JSON.stringify({environment:'Headless Chromium, software rendering; one sequential sample per implementation; not phone FPS',results},null,2));console.log(results);
