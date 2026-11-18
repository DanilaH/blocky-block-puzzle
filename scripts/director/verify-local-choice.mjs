import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { hash } from './architecture/runtime.mjs';
import { localRuntime, hashes, playerSeed } from './local-choice/run.mjs';
const stage=process.argv[2]??'engineering',root='docs/qa/local-choice';
const raw=await fs.readFile(`${root}/${stage}.json.gz`),data=JSON.parse(gunzipSync(raw));
assert.deepEqual(await hashes(),data.source);
const rt=await localRuntime(),{R,A,L}=rt;
const checks={games:0,actions:0,trays:0,poolTrays:0,sampledPaths:0,broadPaths:0,negativeLasts:0,matchedAblations:0,budgetCases:0,dataSha256:hash(raw)};
function replay(board,tray,path){let b=board,lines=0,earned=false;const used=new Set();
 for(const m of path){assert(!used.has(m.slot));used.add(m.slot);const s=R.shapeById(tray[m.slot].shapeId);assert(R.fits(b,s,m.x,m.y));
  const p=R.place(b,s,m.x,m.y);b=p.board;lines+=p.lines;earned ||= b.every(c=>!c);
 }
 assert.equal(used.size,3);return{lines,earned,board:b};
}
function verifyDeal(board,d){replay(board,d.tray,d.witness);checks.trays++;
 for(const p of d.diagnostic?.pool??[]){replay(board,p.tray,p.witness);checks.poolTrays++;
  for(const r of p.roots)for(const s of r.seconds){let lines=0,rewards=0;
   for(const w of s.witnesses){const result=replay(board,p.tray,w);lines+=result.lines;rewards+=Number(result.earned);checks.sampledPaths++;}
   assert.equal(s.lines,lines);assert.equal(s.reward,rewards);
   if(s.status==='unsolvable'){
    let b=board;const t=structuredClone(p.tray);for(const m of [r.move,s.move]){b=R.place(b,R.shapeById(t[m.slot].shapeId),m.x,m.y).board;t[m.slot].used=true;}
    assert.equal(A.actions(A.toRows(b),t).length,0);assert(s.complete);checks.negativeLasts++;
   }
  }
 }
 for(const r of d.broad.roots){if(r.witness){replay(board,d.tray,[r.move,...r.witness]);checks.broadPaths++;}
  for(const s of r.seconds)if(s.witness){replay(board,d.tray,[r.move,s.move,...s.witness]);checks.broadPaths++;}
 }
}
try{
 for(const run of data.runs){const local=['local-choice','random-pool'].includes(run.policy),version=local?'initial-v1':run.policy;
  let history=L.initialLocalHistory(),g=R.newGame(run.seed,'local-choice-'+run.seed,version),rng=playerSeed(run.seed),di=0;
  if(local){const d=L.localChoiceDeal(R.emptyBoard(),run.seed,0,history,run.policy==='random-pool'?'random':'ranked');g={...g,tray:d.tray,rngState:d.rngState,dealerFallbacks:Number(d.fallback)};assert.deepEqual(d.diagnostic,run.deals[0].diagnostic)}
  g={...g,scoringVersion:'festival-v4',seriesBonusVersion:1};history={...history,recentBags:[g.tray.map(s=>R.shapeById(s.shapeId).family).sort().join(',')]};
  function check(){const d=run.deals[di++];assert.equal(d.move,g.moves);assert.deepEqual(d.board,A.toRows(g.board));assert.deepEqual(d.tray,g.tray);verifyDeal(g.board,d);}
  check();
  for(let i=0;i<run.actions.length;i++){
   const r=R.random(rng);rng=r.state;const m=rt.choose(g.board,g.tray,run.style,r.value);assert.deepEqual([m.slot,m.x,m.y],run.actions[i]);
   const before=g,refill=g.tray.filter(s=>!s.used).length===1,a=R.applyMove(g,m,g.revision);assert(a);g=a.state;history=L.observeLocalHistory(history,a.allClear);
   if(refill){if(local){const d=L.localChoiceDeal(g.board,before.rngState,g.moves,history,run.policy==='random-pool'?'random':'ranked');
     g={...g,tray:d.tray,rngState:d.rngState,dealerFallbacks:before.dealerFallbacks+Number(d.fallback),status:R.hasMove(g.board,d.tray)?'playing':'over'};
     assert.deepEqual(d.diagnostic,run.deals[di].diagnostic);
    }
    check();history={...history,recentBags:[...history.recentBags,g.tray.map(s=>R.shapeById(s.shapeId).family).sort().join(',')].slice(-4)};
   }
   assert.deepEqual([a.lines,Number(a.allClear),g.board.filter(Boolean).length],run.events[i]);checks.actions++;
  }
  assert.equal(hash({game:g,history}),run.finalHash);assert.equal(di,run.deals.length);checks.games++;
 }
 // Fixed-input mode ablation plus several low-budget state/input properties.
 const examples=data.runs.filter(r=>r.policy==='local-choice').flatMap(r=>r.deals).filter(d=>d.move>0).slice(0,32);
 for(const d of examples){const board=A.toBoard(d.board),h=d.input.history,before=JSON.stringify({board,h});
  const a=L.localChoiceDeal(board,d.input.seed,d.move,h),b=L.localChoiceDeal(board,d.input.seed,d.move,h,'random');
  assert.equal(a.rngState,b.rngState);assert.deepEqual(a.diagnostic.pool,b.diagnostic.pool);checks.matchedAblations++;
  if(checks.matchedAblations<=6)for(const limit of [512,1024,4096,12000]){const c=L.localChoiceDeal(board,d.input.seed,d.move,h,'ranked',limit);
   assert(c.diagnostic.checks<=limit);replay(board,c.tray,c.witness);checks.budgetCases++;
  }
  assert.equal(JSON.stringify({board,h}),before);
 }
 assert.deepEqual(await hashes(),data.source);
 checks.verifierSha256=hash(await fs.readFile('scripts/director/verify-local-choice.mjs'));
 await fs.writeFile(`${root}/checks-${stage}.json`,JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await rt.server.close()}
