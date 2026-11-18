// D84 reuses D83's established public audit contract, never its private player cache.
import assert from 'node:assert/strict';
import {hash} from '../architecture/runtime.mjs';
import {createDealer,actors} from '../played-rollout/dealer.mjs';
export const patch=(rt,state,tray)=>({...state,tray:structuredClone(tray),status:rt.R.hasMove(state.board,tray)?'playing':'over',
  rhythm:{...state.rhythm,recentBags:[...(state.rhythm?.recentBags??[]).slice(0,-1),tray.map(s=>rt.R.shapeById(s.shapeId).family).sort().join(',')]}});
export async function auditCore(rt,data){
  const builder=await createDealer(rt),counts={roots:0,decisions:0,proofMoves:0,forecastMoves:0},cache=new Map();
  const signature=tray=>tray.map(s=>rt.R.shapeById(s.shapeId).family).sort().join(',');
  function choose(state,style,roll){const key=JSON.stringify([state.board,state.tray,style,style==='three'?0:roll]);
    if(!cache.has(key))cache.set(key,rt.choose(state.board,state.tray,style,roll));return cache.get(key);}
  function proof(board,p){rt.verify(board,p);counts.proofMoves+=p.witness.length;}
  function step(state,e,style,roll){const move=choose(state,style,roll);assert.deepEqual(move,{slot:e.slot,x:e.x,y:e.y});
    assert.equal(state.tray[move.slot].shapeId,e.shapeId);const a=rt.R.applyMove(state,move,state.revision);assert(a);
    assert.deepEqual(rt.A.toRows(a.state.board),e.rows);assert.equal(a.lines,e.lines);assert.equal(a.allClear,e.clear);return a.state;}
  for(const root of data.roots){
    assert.equal(root.inputHash,hash(root.state));const rebuilt=builder.rootFor(root.state,root.pool[0]);
    assert.deepEqual(rebuilt.pool,root.pool);assert.equal(rebuilt.proposalChecks,root.proposalChecks);root.pool.forEach(p=>proof(root.state.board,p));
    const horizons=Object.keys(root.forecasts).map(Number),largest=Math.max(...horizons);
    for(let ci=0;ci<root.pool.length;ci++)for(let ai=0;ai<actors.length;ai++){
      const recorded=root.forecasts[largest][ci][ai],actor=actors[ai];let state=patch(rt,root.state,root.pool[ci].tray);
      const states=[state],future=[];
      for(const[i,e]of recorded.events.entries()){
        const refill=state.tray.filter(s=>!s.used).length===1;state=step(state,e,actor.style,actor.roll);states.push(state);counts.forecastMoves++;
        if(refill)future.push({at:i+1,tray:state.tray,rngState:state.rngState});
      }
      assert(recorded.events.length===largest||state.status==='over');
      for(const h of horizons){const f=root.forecasts[h][ci][ai],n=Math.min(h,recorded.events.length),events=recorded.events.slice(0,n),end=states[n];
        assert.deepEqual(f.events,events);assert.deepEqual(f.future,future.filter(x=>x.at<=n));assert.equal(f.finalHash,hash(end));
        assert.equal(f.actor,ai);assert.equal(f.horizon,h);assert.equal(f.moves,n);assert.equal(f.firstComplete,n>=3);assert.equal(f.dead,end.status==='over');
        assert.equal(f.lines,events.reduce((a,e)=>a+e.lines,0));assert.equal(f.clears,events.filter(e=>e.lines>0).length);assert.equal(f.rewards,events.filter(e=>e.clear).length);
      }
    }
    for(const h of horizons){const rows=root.forecasts[h],base=rows[0],bl=row=>row.slice(0,3).reduce((n,f)=>n+f.lines,0);
      const expected=rows.map((row,index)=>({index,eligible:row.every(f=>f.firstComplete)&&bl(row)*100>=bl(base)*95&&row[3].lines*100>=base[3].lines*95,
        score:[row.slice(0,3).filter(f=>f.rewards>0).length,-Math.max(0,row[3].rewards-1),Math.min(...row.slice(0,3).map(f=>f.clears)),row.reduce((n,f)=>n+f.lines,0),
          -(root.state.rhythm?.recentBags??[]).slice(0,-1).filter(b=>b===signature(root.pool[index].tray)).length,-index],boundedLines:bl(row),strongLines:row[3].lines}));
      assert.deepEqual(JSON.parse(JSON.stringify(expected)),root.selections[h].assessments);
      const eligible=expected.filter(a=>a.eligible).sort((a,b)=>{for(let j=0;j<a.score.length;j++)if(a.score[j]!==b.score[j])return b.score[j]-a.score[j];return 0;});
      assert.equal(root.selections[h].index,eligible[0]?.index??0);assert.equal(root.selections[h].noEligible,!eligible.length);counts.decisions++;
    }
    counts.roots++;if(counts.roots%100===0)console.log(JSON.stringify({stage:'public-forecasts',done:counts.roots,total:data.roots.length}));
  }
  return{counts,choose,proof,step};
}
