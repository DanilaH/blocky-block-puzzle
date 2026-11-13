import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {orderLoadRuntime} from './order-load-runtime.mjs';

const file='docs/qa/director-order-load/results.json.gz',bytes=await fs.readFile(file),data=JSON.parse(gunzipSync(bytes));
assert.equal(data.schema,'blocky-order-load-study-v2');assert.equal(data.runs.length,144);
const {server,R,G,D,H,A}=await orderLoadRuntime();
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
let moves=0,oldMoves=0,oldRuns=0,proofs=0,maxWork=0,diagnostics=0;
function verifyDeal(board,d,record){
  assert.deepEqual(A.toRows(board),record.board);assert.deepEqual(d.tray.map(s=>s.shapeId),record.tray);
  for(const [k,v] of Object.entries(d.diagnostic))assert.deepEqual(record[k],v);
  assert(d.diagnostic.checks<=24000);maxWork=Math.max(maxWork,d.diagnostic.checks);diagnostics++;
  if(d.diagnostic.actual==='load')for(const s of d.tray)assert(R.placements(board,R.shapeById(s.shapeId)).length>0);
  if(d.diagnostic.actual==='order'){
    const result=A.analyze(board,d.tray,100000);
    assert(result.status==='solvable');
    // Every recorded recipe restricts at least one initial figure. This is also
    // sufficient to independently bound all possible slot-order permutations.
    const initial=d.tray.filter(s=>R.placements(board,R.shapeById(s.shapeId)).length>0).length;
    assert(initial>=1&&initial<3&&initial*2<=d.diagnostic.orderBound);
    if(result.complete)assert(result.viableSlotOrders.length<=d.diagnostic.orderBound);
  }
  if(!d.witness){assert.equal(d.diagnostic.source,'load-risk-individually-fitting');return;}
  let b=board;const used=new Set();
  for(const m of d.witness){assert(!used.has(m.slot));used.add(m.slot);const s=R.shapeById(d.tray[m.slot].shapeId);assert(R.fits(b,s,m.x,m.y));b=R.place(b,s,m.x,m.y).board;}
  assert.equal(used.size,3);proofs++;
}
try{
  for(const [file,sha] of Object.entries(data.source))assert.equal(createHash('sha256').update(await fs.readFile(file)).digest('hex'),sha);
  for(const run of data.runs){
    const engine=run.mode==='guarded'?G:R;
    let g=engine.newGame(run.seed,'order-load-'+run.seed,run.mode==='baseline'?'flow-v4':'director-v1');
    let pending=run.mode==='baseline'?null:D.orderDirectorDeal(R.emptyBoard(),run.seed,0,undefined,undefined,{guardLoad:run.mode==='guarded'});
    let di=0,lines=0,clears=0;const rewards=[];
    for(let i=0;i<run.actions.length;i++){
      if(g.tray.every(s=>!s.used)){
        const record=run.deals[di++];assert.equal(record.move,g.moves);
        if(pending)verifyDeal(g.board,pending,record);
        else {assert.deepEqual(A.toRows(g.board),record.board);assert.deepEqual(g.tray.map(s=>s.shapeId),record.tray);}
      }
      const [slot,x,y]=run.actions[i],refill=g.tray.filter(s=>!s.used).length===1;
      const moved=engine.applyMove(JSON.parse(JSON.stringify(g)),{slot,x,y},g.revision);assert(moved);
      assert.deepEqual([moved.lines,Number(moved.allClear),moved.state.board.filter(Boolean).length],run.events[i]);
      if(refill&&run.mode!=='baseline'){
        pending=D.orderDirectorDeal(moved.state.board,g.rngState,g.moves+1,
          H.advanceRhythmV4(g.rhythm,moved.state.board,moved.lines,moved.allClear,R.random(g.rngState).value),
          D.observeOrderDirector(g.director,moved.allClear),{guardLoad:run.mode==='guarded'});
        assert.deepEqual(pending.tray,moved.state.tray);assert.equal(pending.rngState,moved.state.rngState);assert.deepEqual(pending.director,moved.state.director);
      }
      lines+=moved.lines;clears+=Number(moved.allClear);if(moved.lines)rewards.push(moved.state.moves);
      g=moved.state;moves++;
    }
    assert.equal(di,run.deals.length);assert.equal(hash(g),run.finalHash);assert.equal(g.moves,run.moves);assert.equal(g.score,run.score);
    assert.equal(lines,run.lines);assert.equal(clears,run.clears);assert.equal(g.status==='over',run.ended);assert.equal(g.status==='playing',run.censored);
    assert.equal(g.dealerFallbacks,run.fallbacks);assert.deepEqual(rewards.slice(1).map((n,i)=>n-rewards[i]),run.gaps);
    assert.equal(rewards[0]??null,run.firstReward);assert.equal(rewards[0]??g.moves,run.initialDry);assert.equal(rewards.length?g.moves-rewards.at(-1):g.moves,run.terminalDry);
  }
  // Historical, externally frozen flow-v4 data predates all current core edits.
  const old=JSON.parse(gunzipSync(await fs.readFile('docs/qa/director-two-tray/results.json.gz')));
  for(const run of old.runs.filter(r=>r.mode==='baseline')){
    let g=R.newGame(run.seed,'two-tray-'+run.seed,'flow-v4');
    for(const [slot,x,y] of run.actions){const moved=R.applyMove(g,{slot,x,y},g.revision);assert(moved);g=moved.state;oldMoves++;}
    assert.equal(hash(g),run.finalHash);oldRuns++;
  }
  assert.equal(oldRuns,80);
  const result={valid:true,runs:data.runs.length,moves,proofs,diagnostics,maxWork,oldRuns,oldMoves,resultsSha256:createHash('sha256').update(bytes).digest('hex')};
  await fs.writeFile('docs/qa/director-order-load/replay-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await server.close();}
