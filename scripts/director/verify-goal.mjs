import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {goalRuntime} from './goal-runtime.mjs';
const bytes=await fs.readFile('docs/qa/director-goal-cycle/results.json.gz'),data=JSON.parse(gunzipSync(bytes));
assert.equal(data.schema,'blocky-goal-cycle-study-v1');assert.equal(data.runs.length,96);
const {server,R,D,H,A}=await goalRuntime(),V=await server.ssrLoadModule('/scripts/director/goal-certificates.ts');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
let moves=0,proofs=0,maxWork=0,oldMoves=0,oldRuns=0,allInitiallyAvailable=0;
const certificates={'slot-order':0,placement:0,'reward-choice':0},availability={};
try{
 for(const [file,sha] of Object.entries(data.source))assert.equal(createHash('sha256').update(await fs.readFile(file)).digest('hex'),sha,'Source mismatch '+file);
 for(const run of data.runs){
  let g=R.newGame(run.seed,'goal-cycle-'+run.seed,run.mode==='baseline'?'flow-v4':'director-v2'),di=0,lastLoad=-Infinity;
  function generated(input){
    const record=run.deals[di++];assert.equal(record.move,g.moves);assert.deepEqual(A.toRows(g.board),record.board);assert.deepEqual(record.input,input);
    const d=D.goalDirectorDeal(g.board,input.seed,input.moves,input.rhythm,input.saved);
    assert.deepEqual(d.tray,g.tray);assert.deepEqual(d.tray,record.tray);assert.deepEqual(d.witness,record.witness);assert.deepEqual(d.diagnostic,record.diagnostic);
    assert.equal(d.rngState,g.rngState);assert.equal(d.rngState,record.outputRng);assert.deepEqual(d.director,g.goalDirector);assert.deepEqual(d.director,record.outputDirector);
    maxWork=Math.max(maxWork,d.diagnostic.checks);const audited=V.verifyGoalDeal(g.board,d);proofs++;
    if(audited.kind){certificates[audited.kind]++;availability[audited.kind]??={};availability[audited.kind][audited.initialAvailable]=(availability[audited.kind][audited.initialAvailable]??0)+1;if(audited.initialAvailable===3)allInitiallyAvailable++;}
    if(d.diagnostic.actual==='load'){
      assert(g.moves>=12&&g.moves-lastLoad>=12);lastLoad=g.moves;
      assert(input.saved.sinceLoad>=3);
      assert(d.tray.some(s=>R.shapeById(s.shapeId).cells.length<=4));
      assert.equal(d.diagnostic.large,input.saved.deals>=8?2:d.diagnostic.large);assert(d.diagnostic.large>=1);
    }
  }
  if(run.mode==='candidate')generated({seed:run.seed,moves:0});
  let lines=0,clears=0;
  for(let i=0;i<run.actions.length;i++){
    const [slot,x,y]=run.actions[i],refill=g.tray.filter(s=>!s.used).length===1,before=g,beforeHash=hash(g);
    const moved=R.applyMove(JSON.parse(JSON.stringify(g)),{slot,x,y},g.revision);assert(moved);assert.equal(hash(g),beforeHash);g=moved.state;
    assert.deepEqual([moved.lines,Number(moved.allClear),g.board.filter(Boolean).length],run.events[i]);lines+=moved.lines;clears+=Number(moved.allClear);moves++;
    if(refill&&run.mode==='candidate')generated({seed:before.rngState,moves:g.moves,
      rhythm:H.advanceRhythmV4(before.rhythm,g.board,moved.lines,moved.allClear,R.random(before.rngState).value),
      saved:D.observeGoalDirector(before.goalDirector,moved.allClear)});
    if(run.mode==='candidate'&&moved.allClear){assert.equal(g.goalDirector.payoff,0);assert(refill?g.goalDirector.last==='rest':g.goalDirector.rest===1);}
    if(refill)assert.equal(R.applyMove(g,{slot,x,y},before.revision),null);
  }
  assert.equal(di,run.deals.length);assert.equal(hash(g),run.finalHash);assert.equal(g.score,run.score);assert.equal(g.moves,run.moves);
  assert.equal(lines,run.lines);assert.equal(clears,run.clears);assert.equal(g.status==='over',run.ended);assert.equal(g.status==='playing',run.censored);
  assert.equal(g.dealerFallbacks,run.fallbacks);
  if((data.runs.indexOf(run)+1)%12===0)console.log(JSON.stringify({newReplayed:data.runs.indexOf(run)+1,moves,proofs}));
 }
 // Both frozen ordinary policies must keep their exact old serialized states.
 const old=JSON.parse(gunzipSync(await fs.readFile('docs/qa/director-order-load/results.json.gz')));
 for(const run of old.runs.filter(r=>r.mode!=='guarded')){
  let g=R.newGame(run.seed,'order-load-'+run.seed,run.mode==='baseline'?'flow-v4':'director-v1');
  for(const [slot,x,y] of run.actions){const moved=R.applyMove(g,{slot,x,y},g.revision);assert(moved);g=moved.state;oldMoves++;}
  assert.equal(hash(g),run.finalHash);oldRuns++;
 }
 assert.equal(oldRuns,96);assert(maxWork<=24000);
 const result={valid:true,runs:data.runs.length,moves,proofs,maxWork,certificates,allInitiallyAvailable,availability,oldRuns,oldMoves,
   resultsSha256:createHash('sha256').update(bytes).digest('hex')};
 await fs.writeFile('docs/qa/director-goal-cycle/replay-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await server.close();}
