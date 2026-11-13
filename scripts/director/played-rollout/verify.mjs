// Independent public/player replay and score/guard reconstruction. Never selects
// by a terminal geometry proxy or reads future trays when choosing an action.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {runtime,hash,playerSeed} from '../architecture/runtime.mjs';
import {createDealer,actors} from './dealer.mjs';
const out='docs/qa/played-rollout',bytes=await fs.readFile(`${out}/results.json.gz`),data=JSON.parse(gunzipSync(bytes)),rt=await runtime(),builder=await createDealer(rt);
const sourceCells=[],counts={sourceMoves:0,proofMoves:0,forecastMoves:0,actualMoves:0,roots:0,selections:0};
try{
  for(const[p,h]of Object.entries(data.source))assert.equal(hash(await fs.readFile(p)),h,p);
  const signature=tray=>tray.map(s=>rt.R.shapeById(s.shapeId).family).sort().join(',');
  const patch=(state,tray)=>({...state,tray:structuredClone(tray),status:rt.R.hasMove(state.board,tray)?'playing':'over',
    rhythm:{...state.rhythm,recentBags:[...(state.rhythm?.recentBags??[]).slice(0,-1),signature(tray)]}});
  // This replay cache uses literal board/tray JSON, independently of the dealer's
  // occupancy-only cache. The unchanged player is called on misses.
  const choices=new Map();
  function choose(state,style,roll){const key=JSON.stringify([state.board,state.tray,style,style==='three'?0:roll]);
    if(!choices.has(key))choices.set(key,rt.choose(state.board,state.tray,style,roll));return choices.get(key);}
  function event(before,move,expected){
    assert.equal(before.tray[move.slot].shapeId,expected.shapeId);
    const a=rt.R.applyMove(before,move,before.revision);assert(a);
    assert.deepEqual(rt.A.toRows(a.state.board),expected.rows);assert.equal(a.lines,expected.lines);assert.equal(a.allClear,expected.clear);return a.state;
  }
  function proof(board,d){rt.verify(board,d);counts.proofMoves+=d.witness.length;}
  for(const g of data.sourceGames){let state=structuredClone(g.initial),rng=playerSeed(g.seed);
    for(const e of g.events){const r=rt.R.random(rng);rng=r.state;assert.equal(r.value,e.roll);
      assert.deepEqual(rt.choose(state.board,state.tray,'bounded',e.roll),e.move);
      const shapeId=state.tray[e.move.slot].shapeId,a=rt.R.applyMove(state,e.move,state.revision);assert(a);
      sourceCells.push({rows:rt.A.toRows(state.board),shapeId,x:e.move.x,y:e.move.y,after:e.rows,lines:e.lines});
      state=a.state;assert.deepEqual(rt.A.toRows(state.board),e.rows);assert.equal(a.lines,e.lines);assert.equal(a.allClear,e.clear);counts.sourceMoves++;}
    assert.equal(hash(state),g.finalHash);
  }
  for(const root of data.roots){
    assert.equal(hash(root.state),root.inputHash);const rebuilt=builder.rootFor(root.state,root.pool[0]);
    assert.deepEqual(rebuilt.pool,root.pool);assert.equal(rebuilt.proposalChecks,root.proposalChecks);
    for(const p of root.pool)proof(root.state.board,p);
    const hs=Object.keys(root.forecasts).map(Number),longest=Math.max(...hs);
    for(let ci=0;ci<root.pool.length;ci++)for(let ai=0;ai<actors.length;ai++){
      const recorded=root.forecasts[longest][ci][ai],actor=actors[ai];let state=patch(root.state,root.pool[ci].tray);
      const states=[state],future=[];
      for(const[eindex,e]of recorded.events.entries()){
        const move=choose(state,actor.style,actor.roll);assert.deepEqual(move,{slot:e.slot,x:e.x,y:e.y});
        const refill=state.tray.filter(s=>!s.used).length===1;state=event(state,move,e);states.push(state);counts.forecastMoves++;
        if(refill)future.push({at:eindex+1,tray:state.tray,rngState:state.rngState});
      }
      assert(recorded.events.length===longest||state.status==='over');
      for(const horizon of hs){const f=root.forecasts[horizon][ci][ai],n=Math.min(horizon,recorded.events.length),events=recorded.events.slice(0,n),end=states[n];
        assert.equal(f.horizon,horizon);assert.equal(f.actor,ai);assert.deepEqual(f.events,events);
        assert.deepEqual(f.future,future.filter(d=>d.at<=n));assert.equal(f.finalHash,hash(end));
        assert.equal(f.firstComplete,n>=3);assert.equal(f.dead,end.status==='over');assert.equal(f.moves,n);
        assert.equal(f.lines,events.reduce((a,e)=>a+e.lines,0));assert.equal(f.clears,events.filter(e=>e.lines>0).length);assert.equal(f.rewards,events.filter(e=>e.clear).length);
      }
    }
    for(const horizon of hs){
      const fc=root.forecasts[horizon],base=fc[0],bl=row=>row.slice(0,3).reduce((n,f)=>n+f.lines,0);
      const assessments=fc.map((row,index)=>({index,eligible:row.every(f=>f.firstComplete)&&bl(row)*100>=bl(base)*95&&row[3].lines*100>=base[3].lines*95,
        score:[row.slice(0,3).filter(f=>f.rewards>0).length,-Math.max(0,row[3].rewards-1),Math.min(...row.slice(0,3).map(f=>f.clears)),row.reduce((n,f)=>n+f.lines,0),
          -(root.state.rhythm?.recentBags??[]).slice(0,-1).filter(b=>b===signature(root.pool[index].tray)).length,-index],boundedLines:bl(row),strongLines:row[3].lines}));
      // JSON serializes -0 as0; sign of a zero tie-break is not a policy input.
      assert.deepEqual(JSON.parse(JSON.stringify(assessments)),root.selections[horizon].assessments);
      const eligible=assessments.filter(a=>a.eligible);eligible.sort((a,b)=>{for(let j=0;j<a.score.length;j++)if(a.score[j]!==b.score[j])return b.score[j]-a.score[j];return 0;});
      assert.equal(root.selections[horizon].index,eligible[0]?.index??0);assert.equal(root.selections[horizon].noEligible,!eligible.length);counts.selections++;
    }
    counts.roots++;
    if(counts.roots%80===0)console.log(JSON.stringify({stage:'forecast-replay',done:counts.roots,total:data.roots.length}));
  }
  for(const run of[...data.matched,...data.games]){
    let state=structuredClone(run.initialState),dealIndex=0;
    function issue(){const d=run.deals[dealIndex++];assert.deepEqual(d.base,state);proof(state.board,d.proof);
      if(run.mode==='v2'){assert.equal(d.root,null);assert.equal(d.index,0);return;}
      const root=data.roots[d.root],h=run.mode==='short'?3:9;assert.equal(root.inputHash,hash(state));assert.equal(root.selections[h].index,d.index);
      const next=patch(state,root.pool[d.index].tray);assert.equal(next.rngState,state.rngState);assert.deepEqual(next.goalDirector,state.goalDirector);state=next;
    }issue();
    for(const[i,e]of run.events.entries()){
      const move=choose(state,run.style,e.roll);assert.deepEqual(move,{slot:e.slot,x:e.x,y:e.y});const refill=state.tray.filter(s=>!s.used).length===1;
      state=event(state,move,e);counts.actualMoves++;
      if(refill&&i+1<run.events.length)issue();
    }
    assert.equal(dealIndex,run.deals.length);assert.equal(hash(state),run.finalHash);assert.equal(state.status==='over',run.ended);
    assert.equal(run.censored,state.status==='playing'&&run.events.length===run.cap);assert.equal(run.earned,run.events.some(e=>e.clear));
  }
  // The two selectors start each matched experiment from one identical issued
  // base state; proposals/actual RNG do not depend on selector horizon.
  for(const run of data.matched.filter(r=>r.mode==='short')){
    const long=data.matched.find(r=>r.mode==='rollout'&&r.input===run.input&&r.style===run.style&&r.quantile===run.quantile);
    assert.deepEqual(run.deals[0].base,long.deals[0].base);
    assert.deepEqual(data.roots[run.deals[0].root].pool,data.roots[long.deals[0].root].pool);
  }
  await fs.writeFile(`${out}/source-cell-fixtures.json`,JSON.stringify(sourceCells)+'\n');
  const output={schema:'blocky-played-rollout-public-check-v1',resultSha256:hash(bytes),verifierSha256:hash(await fs.readFile('scripts/director/played-rollout/verify.mjs')),...counts,
    runs:data.matched.length+data.games.length,sourceGames:data.sourceGames.length};
  await fs.writeFile(`${out}/checks-public.json`,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
}finally{await rt.server.close();}
