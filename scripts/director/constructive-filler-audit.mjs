// Diagnostic ablation only. It cannot establish acceptance or human balance.
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mixedRuntime} from './mixed-runtime.mjs';
const {server,R,MP}=await mixedRuntime();
try{
 const raw=await fs.readFile('docs/qa/director-constructive/results.json.gz'),data=JSON.parse(gunzipSync(raw));
 const out=[];
 for(const run of data.runs){
  if(run.mode!=='candidate'||run.style!=='bounded')continue;
  for(const d of run.deals){
   if(!d.diagnostic.goalFound||d.move+3>run.moves)continue;
   const board=d.board.flatMap(r=>Array.from({length:8},(_,x)=>Number(!!(r&(1<<x)))));
   let b=board,prefix=[];
   for(const m of d.witness){const shape=R.shapeById(d.tray[m.slot].shapeId);assert(R.fits(b,shape,m.x,m.y));b=R.place(b,shape,m.x,m.y).board;prefix.push(m.slot);if(b.every(c=>!c))break;}
   if(prefix.length>=3)continue;
   let rng=createHash('sha256').update('mixed-player:'+run.seed).digest().readUInt32LE(0);
   for(let i=0;i<d.move;i++)rng=R.random(rng).state;
   const rolls=[];for(let i=0;i<3;i++){const r=R.random(rng);rng=r.state;rolls.push(r.value)}
   function play(tray){let b=board,earned=false,lines=0;const slots=structuredClone(tray),actions=[];
    for(const roll of rolls){const m=MP.chooseMixed(b,slots,'bounded',roll).move;if(!m)break;const n=R.place(b,R.shapeById(slots[m.slot].shapeId),m.x,m.y);b=n.board;earned ||= b.every(c=>!c);lines+=n.lines;slots[m.slot].used=true;actions.push(m)}
    return {earned,lines,actions};
   }
   const original=play(d.tray);
   assert.equal(original.earned,run.events.slice(d.move,d.move+3).some(e=>e[1]));
   const largest=prefix.map(i=>d.tray[i].shapeId).sort((a,b)=>R.shapeById(b).cells.length-R.shapeById(a).cells.length)[0];
   const variants=[];
   for(const id of [...new Set([largest,'O2-0','R6-0','R6-1'])]){
    const tray=d.tray.map((s,i)=>prefix.includes(i)?s:{...s,shapeId:id});
    variants.push({filler:id,...play(tray)});
   }
   out.push({split:run.split,seed:run.seed,move:d.move,board:d.board,tray:d.tray,payoffSlots:prefix,source:d.diagnostic.source,original,variants});
  }
 }
 await fs.writeFile('docs/qa/director-constructive/filler-audit.json',JSON.stringify({sourceSha256:createHash('sha256').update(raw).digest('hex'),note:'Diagnostic only: same recorded board and RNG, predetermined alternative fillers; no policy acceptance evidence.',cases:out},null,2)+'\n');
 console.log(JSON.stringify({cases:out.length,originalRewards:out.filter(e=>e.original.earned).length,recoverableMisses:out.filter(e=>!e.original.earned&&e.variants.some(v=>v.earned)).length}));
}finally{await server.close()}
