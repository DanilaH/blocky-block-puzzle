// Diagnostic ablations only. Never imported by the game.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const server=await createServer({root:process.env.BLOCKY_ROOT||process.cwd(),server:{host:'127.0.0.1',port:5192,strictPort:true}});await server.listen();
const browser=await chromium.launch();const results=[];
const layers=process.argv[2]==='layers';
const modes=['full','idle-drag'];
try {for(let repeat=0;repeat<1;repeat++)for(const mode of modes) {
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 await page.goto('http://127.0.0.1:5192');await page.waitForFunction(()=>!document.querySelector('#app').inert);
 await page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');const {newGame}=await import('/src/core/rules.ts');const a=new IndexedSave(),p=(await a.load()).profile;p.revision++;p.tutorialStep=4;p.best=p.festivalBest=100000;p.game={...newGame(1234,'perf-audit'),moves:10,streak:5,scoringVersion:'festival-v3'};p.game.tray=[{shapeId:'O3-0',color:2,used:false},{shapeId:'S1-0',color:3,used:false},{shapeId:'S1-0',color:4,used:false}];for(let y=0;y<8;y++)for(let x=0;x<8;x++)if((y<3&&x>=3)||(x<3&&y>=3))p.game.board[y*8+x]=(x+y)%6+1;p.game.board[63]=3;await a.write(p);});
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#app').inert);await page.waitForTimeout(1200);await page.screenshot({path:'/tmp/blocky-'+(process.env.BLOCKY_TAG||'current')+'-'+mode+'.png'});
 await page.evaluate(async mode=>{
  window.audit={rectReads:0,previewCalls:0,draws:0,drawCPU:0,festivalPeak:0,vfxPeak:0,long:[]};
  const rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...a){if(this.id==='board')window.audit.rectReads++;return rect.apply(this,a);};
  const {BoardScene}=await import('/src/game/BoardScene.ts');const draw=BoardScene.prototype.draw,preview=BoardScene.prototype.preview;
  BoardScene.prototype.preview=function(...a){window.audit.previewCalls++;return preview.apply(this,a);};
  BoardScene.prototype.draw=function(...a){const t=performance.now();const r=draw.apply(this,a);window.audit.draws++;window.audit.drawCPU+=performance.now()-t;window.audit.vfxPeak=Math.max(window.audit.vfxPeak,this.vfx?.cursor??0);if(mode==='no-graphics'||mode==='no-ink')this.ink.setVisible(false);if(mode==='no-graphics'||mode==='no-bed')this.bed?.setVisible(false);return r;};
  const {Festival}=await import('/src/game/festival.ts');const fd=Festival.prototype.draw;Festival.prototype.draw=function(...a){window.audit.festivalPeak=Math.max(window.audit.festivalPeak,this.sparks.length);if(mode==='no-festival'){this.stop();return;}return fd.apply(this,a);};
  if(mode==='no-ambient'){const {Atmosphere}=await import('/src/game/atmosphere.ts');Atmosphere.prototype.draw=function(){this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);};}
  if(mode==='no-filters'||mode==='no-theme-transition'){const s=document.createElement('style');s.textContent=mode==='no-filters'?'*,*::before,*::after {filter:none!important;backdrop-filter:none!important}':':root,.board-wrap,.mini-cell {transition:none!important}';document.head.append(s);}
  new PerformanceObserver(list=>window.audit.long.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask'});
 },mode);
 if(mode!=='idle-drag'){await page.locator('[data-slot="0"]').click();const b=await page.locator('#board').boundingBox();await page.mouse.click(b.x+b.width/16,b.y+b.height/16);await page.waitForFunction(()=>document.querySelector('[data-slot="0"]').classList.contains('used'));}
 const piece=await page.locator('[data-slot="1"]').boundingBox();await page.mouse.move(piece.x+piece.width/2,piece.y+piece.height/2);await page.mouse.down();
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');const before=(await cdp.send('Performance.getMetrics')).metrics;
 const frames=await page.evaluate(()=>new Promise(resolve=>{const samples=[];const start=performance.now();let last=start;let n=0;function step(t){samples.push(t-last);last=t;n++;window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,pointerType:'mouse',buttons:1,clientX:70+(n%15)*15,clientY:360+Math.sin(n*.25)*70,bubbles:true,cancelable:true}));if(t-start<1600)requestAnimationFrame(step);else resolve(samples);}requestAnimationFrame(step);}));
 const after=(await cdp.send('Performance.getMetrics')).metrics;const metrics={};for(const name of ['LayoutCount','LayoutDuration','RecalcStyleCount','RecalcStyleDuration','ScriptDuration','TaskDuration'])metrics[name]=(after.find(m=>m.name===name)?.value??0)-(before.find(m=>m.name===name)?.value??0);
 const audit=await page.evaluate(()=>window.audit);const sorted=frames.slice(1).sort((a,b)=>a-b);results.push({repeat,mode,frames:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],over33:sorted.filter(t=>t>33.4).length,metrics,audit});
 await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,pointerType:'mouse',bubbles:true})));await page.mouse.up();await page.close();console.log(JSON.stringify(results.at(-1)));
}}finally{await browser.close();await server.close();}
await fs.writeFile('/tmp/blocky-compare-'+(process.env.BLOCKY_TAG||'current')+'.json',JSON.stringify({environment:'Chromium software renderer, 390x844 DPR2; one full-combo and one idle-drag scenario per invocation; not Android FPS',results},null,2));
