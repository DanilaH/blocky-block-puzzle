import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mixedRuntime} from './mixed-runtime.mjs';
const {server,R,D,H,MP,V,A}=await mixedRuntime();
const D2=await server.ssrLoadModule('/src/core/goal-director.ts');
const raw=await fs.readFile('docs/qa/director-mixed/results.json.gz'),data=JSON.parse(gunzipSync(raw));
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
let games=0,moves=0,trios=0,roots=0,goals=0,negatives=0,unknown=0;
try{
 for(const [f,h] of Object.entries(data.source))assert.equal(hash(await fs.readFile(f,'utf8')),h,'Changed frozen source: '+f);
 for(const run of data.runs){
  const baseline=run.mode==='baseline';
  let g=R.newGame(run.seed,'mixed-study-'+run.seed,baseline?'director-v2':'director-v3'),cursor=0;
  let rng=createHash('sha256').update('mixed-player:'+run.seed).digest().readUInt32LE(0);
  function inspect(input){
   const record=run.deals[cursor++];assert(record);assert.deepEqual(record.input,input);assert.deepEqual(A.toRows(g.board),record.board);
   assert.deepEqual(g.tray,record.tray);assert.equal(g.rngState,record.outputRng);
   assert.deepEqual(baseline?g.goalDirector:g.mixedDirector,record.outputDirector);
   if(!baseline){const p=V.verifyMixedDeal(g.board,record);roots+=p.safe;goals+=p.goals;negatives+=p.negative;unknown+=p.unknown;}
   trios++;
  }
  inspect({seed:run.seed,moves:0});
  for(let i=0;i<run.actions.length;i++){
   const r=R.random(rng);rng=r.state;const [slot,x,y]=run.actions[i],move={slot,x,y};
   const old=g,refill=g.tray.filter(s=>!s.used).length===1,a=R.applyMove(g,move,g.revision);assert(a);g=a.state;
   assert.deepEqual([a.lines,Number(a.allClear),g.board.filter(Boolean).length],run.events[i].slice(0,3));
   assert.equal(Number(run.style==='lapse'&&r.value<.2),run.events[i][3]);
   if(refill){const rhythm=H.advanceRhythmV4(old.rhythm,g.board,a.lines,a.allClear,R.random(old.rngState).value);
    const saved=baseline?D2.observeGoalDirector(old.goalDirector,a.allClear):D.observeMixedDirector(old.mixedDirector,a.allClear);
    inspect({seed:old.rngState,moves:g.moves,rhythm,saved});}
   moves++;
  }
  assert.equal(cursor,run.deals.length);assert.equal(hash(g),run.finalHash);assert.equal(g.status==='over',run.ended);games++;
 }
 const result={valid:true,games,moves,trios,roots,goals,negatives,unknown,playerChoicesRecomputed:false,sourceSha256:createHash('sha256').update(raw).digest('hex')};
 await fs.writeFile('docs/qa/director-mixed/replay.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await server.close();}
