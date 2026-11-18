// Independent D84 schedule audit uses deal-index modulo, not implementation counter.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {runtime,hash,playerSeed} from '../architecture/runtime.mjs';
import {actors} from './policy.mjs';
import {auditCore,patch} from './audit-core.mjs';
const out='docs/qa/committed-rollout',bytes=await fs.readFile(`${out}/results.json.gz`),data=JSON.parse(gunzipSync(bytes)),rt=await runtime();
try{
  for(const[p,h]of Object.entries(data.source))assert.equal(hash(await fs.readFile(p)),h,p);
  const core=await auditCore(rt,data),{counts,choose,proof,step}=core;
  Object.assign(counts,{sourceMoves:0,regressionMoves:0,actualMoves:0,forkMoves:0,scheduledIssues:0});
  const compact=e=>[e.slot,e.x,e.y,e.shapeId,e.rows,e.lines,e.clear];
  for(const g of data.sourceGames){let state=structuredClone(g.initial),rng=playerSeed(g.seed);
    const expected={...rt.R.newGame(g.seed,`committed-rollout-source-${g.seed}`,'director-v2'),scoringVersion:'festival-v4',seriesBonusVersion:1};assert.deepEqual(state,expected);
    for(const e of g.events){const r=rt.R.random(rng);rng=r.state;assert.equal(e.roll,r.value);state=step(state,e,'bounded',e.roll);counts.sourceMoves++;}
    assert.equal(hash(state),g.finalHash);
  }
  for(const input of data.inputs){assert.equal(hash(input.state),data.sourceGames[input.sourceGame].finalHash);assert(input.state.board.some(Boolean));assert.equal(input.state.moves,12);proof(input.state.board,input.proof);}
  function verifyRun(run,kind){
    const fork=kind==='fork',root=fork?data.roots[run.root]:null,initial=fork?root.state:run.initialState;
    const mode=fork?'hold':run.mode,style=fork?actors[run.actor].style:run.style,cap=fork?9:run.cap;
    let state=structuredClone(initial),dealIndex=0,playerRng=kind==='game'?playerSeed(run.seed):null;const boundaries=[];
    function issue(){const number=dealIndex,d=run.deals[dealIndex++];assert.equal(d.at,number*3);
      if(fork)assert.equal(hash(state),d.baseHash);else assert.deepEqual(state,d.base);
      assert.deepEqual(d.proof.tray,state.tray);proof(state.board,d.proof);
      const select=mode!=='v2'&&(mode!=='hold'||number%3===0),action=select?'select':mode==='hold'?'v2-continuation':'v2';
      assert.equal(d.action,action);assert.equal(d.remaining,mode==='hold'?2-number%3:0);assert.equal(d.forced,fork&&number===0);
      if(!select){assert.equal(d.root,null);assert.equal(d.index,0);}else{
        const decision=data.roots[d.root],h=mode==='short'?3:9;assert.equal(decision.inputHash,hash(state));assert.equal(decision.selections[h].index,d.index);
        if(fork){assert.equal(d.root,run.root);assert.equal(d.index,run.index);}
        const next=patch(rt,state,decision.pool[d.index].tray);assert.equal(next.rngState,state.rngState);assert.deepEqual(next.goalDirector,state.goalDirector);state=next;
      }counts.scheduledIssues++;
    }issue();
    for(const[i,e]of run.events.entries()){
      let roll;if(fork)roll=actors[run.actor].roll;else if(kind==='game'){const r=rt.R.random(playerRng);playerRng=r.state;roll=r.value;}else roll=run.quantile;
      assert.equal(e.roll,roll);const refill=state.tray.filter(s=>!s.used).length===1;state=step(state,e,style,roll);
      counts[fork?'forkMoves':kind==='regression'?'regressionMoves':'actualMoves']++;
      if(refill){boundaries.push({at:i+1,baseHash:hash(state)});if(i+1<run.events.length)issue();}
    }
    assert.equal(dealIndex,run.deals.length);assert.deepEqual(run.boundaries,boundaries);assert.equal(hash(state),run.finalHash);
    assert.equal(run.ended,state.status==='over');assert.equal(run.censored,state.status==='playing'&&run.events.length===cap);
    assert(run.events.length===cap||run.ended);if(!fork)assert.equal(run.earned,run.events.some(e=>e.clear));
    if(fork){const expected=root.forecasts['9'][run.index][run.actor];assert.deepEqual(run.events.map(compact),expected.events.map(compact));assert.equal(run.finalHash,expected.finalHash);}
  }
  const oldAudit=JSON.parse(await fs.readFile('docs/qa/played-rollout/policy-audit.json'));
  assert.equal(data.regressions.length,55);const regressionKeys=new Set();
  for(const r of data.regressions){verifyRun(r,'regression');const key=[r.oldInput,r.style,r.quantile].join(':');assert(!regressionKeys.has(key));regressionKeys.add(key);
    const expected=oldAudit.matched.find(a=>a.input===r.oldInput&&a.style===r.style&&a.quantile===r.quantile);assert(expected);
    assert.deepEqual(r.events.map(compact),expected.heldEvents.map(compact));assert.equal(r.finalHash,expected.heldFinalHash);}
  for(const r of data.matched)verifyRun(r,'matched');for(const r of data.games)verifyRun(r,'game');for(const r of data.forks)verifyRun(r,'fork');
  assert.equal(data.forks.length,data.roots.filter(r=>r.selections['9']).length*4);
  for(const r of data.matched.filter(r=>r.mode==='hold')){
    const p=data.matched.find(p=>p.mode==='replan'&&p.input===r.input&&p.style===r.style&&p.quantile===r.quantile);
    assert.equal(r.deals[0].root,p.deals[0].root);assert.equal(r.deals[0].index,p.deals[0].index);assert.deepEqual(r.deals[0].base,p.deals[0].base);
  }
  let strongWindows=0;
  for(const r of data.games.filter(r=>r.mode==='hold'&&r.style==='three'))for(const d of r.deals.filter(d=>d.action==='select')){
    const actual=r.events.slice(d.at,d.at+9);if(actual.length<9&&!r.ended)continue;
    const expected=data.roots[d.root].forecasts['9'][d.index][3];assert.deepEqual(actual.map(compact),expected.events.map(compact));
    const end=r.boundaries.find(b=>b.at===d.at+9)?.baseHash??r.finalHash;assert.equal(end,expected.finalHash);strongWindows++;
  }
  const output={schema:'blocky-committed-rollout-public-check-v1',resultSha256:hash(bytes),counts,
    exactKnownRegressions:data.regressions.length,exactConsistencyForks:data.forks.length,strongWindows,strongMismatches:0,
    verifierSha256:hash(await fs.readFile('scripts/director/committed-rollout/verify.mjs')),
    auditCoreSha256:hash(await fs.readFile('scripts/director/committed-rollout/audit-core.mjs'))};
  await fs.writeFile(`${out}/checks-public.json`,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
}finally{await rt.server.close();}
