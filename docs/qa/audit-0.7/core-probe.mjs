import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
const result=await page.evaluate(async()=>{
 const R=await import('/src/core/rules.ts'),H=await import('/src/core/hints.ts'),P=await import('/src/core/profile.ts');
 let moves=0,ends=0,checks=0;const samples=[],failures=[],times=[];
 function legal(b,s,x,y){return s.cells.every(([dx,dy])=>x+dx>=0&&x+dx<8&&y+dy>=0&&y+dy<8&&b[(y+dy)*8+x+dx]===0);}
 function all(g){const a=[];g.tray.forEach((s,slot)=>{if(s.used)return;const sh=R.shapeById(s.shapeId);for(let y=0;y<8;y++)for(let x=0;x<8;x++){checks++;if(legal(g.board,sh,x,y))a.push({slot,x,y});}});return a;}
 for(let seed=1;seed<=200;seed++){
  let g=R.newGame(seed,'probe'+seed),rng=seed;
  for(let n=0;n<150;n++){
   const options=all(g);if(!options.length){if(g.status!=='over')failures.push('status');ends++;break;}
   rng=(Math.imul(rng,1664525)+1013904223)>>>0;const m=options[rng%options.length],shape=R.shapeById(g.tray[m.slot].shapeId),b=g.board.slice();
   shape.cells.forEach(([dx,dy])=>b[(m.y+dy)*8+m.x+dx]=g.tray[m.slot].color);
   const rows=[],cols=[];for(let j=0;j<8;j++){if(b.slice(j*8,j*8+8).every(Boolean))rows.push(j);if(b.filter((_,i)=>i%8===j).every(Boolean))cols.push(j);}
   for(let i=0;i<64;i++)if(rows.includes(Math.floor(i/8))||cols.includes(i%8))b[i]=0;
   const lines=rows.length+cols.length,streak=lines?g.streak+1:0,points=shape.cells.length+(lines?10*lines*lines+5*(streak-1)*lines:0)+(b.every(v=>!v)?100:0);
   const before=JSON.stringify(g),t=performance.now(),v=R.applyMove(g,m,g.revision);times.push(performance.now()-t);
   if(!v||JSON.stringify(v.state.board)!==JSON.stringify(b)||v.points!==points||v.state.streak!==streak||JSON.stringify(g)!==before)failures.push('move '+seed+':'+n);
   if(R.applyMove(g,m,g.revision+1)!==null)failures.push('stale');
   const replay=R.applyMove(g,m,g.revision);if(JSON.stringify(replay)!==JSON.stringify(v))failures.push('determinism');
   g=v.state;moves++;const p=P.createProfile(g);p.best=g.score;if(!P.validProfile(p))failures.push('valid save');
   if(n===9&&samples.length<30)samples.push(structuredClone(g));
  }
 }
 const hints=[];for(const g of samples){const r=H.findHint(g,180),m=r.move;hints.push(r.diagnostics);if(m&&!legal(g.board,R.shapeById(g.tray[m.slot].shapeId),m.x,m.y))failures.push('illegal hint');if(!m&&all(g).length)failures.push('missing hint');}
 const sorted=times.sort((a,b)=>a-b);return {games:200,moves,ends,checks,failures,applyMoveMs:{p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)},hints};
});await fs.writeFile(new URL('core-results.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,hints:{count:result.hints.length,cutoffs:result.hints.filter(x=>x.cutoff).length,maxMs:Math.max(...result.hints.map(x=>x.elapsedMs)),maxChecks:Math.max(...result.hints.map(x=>x.checks))}},null,2));await browser.close();
