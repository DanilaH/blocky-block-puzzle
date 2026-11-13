// Post-hoc diagnostic only, declared after matched failures were observed.
// It changes no selector, primary run, score or gate.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {runtime,hash} from '../architecture/runtime.mjs';
const out='docs/qa/played-rollout',bytes=await fs.readFile(`${out}/results.json.gz`),data=JSON.parse(gunzipSync(bytes)),rt=await runtime();
try{
  const patch=(state,tray)=>({...state,tray:structuredClone(tray),status:rt.R.hasMove(state.board,tray)?'playing':'over',
    rhythm:{...state.rhythm,recentBags:[...(state.rhythm?.recentBags??[]).slice(0,-1),tray.map(s=>rt.R.shapeById(s.shapeId).family).sort().join(',')]}});
  const compact=e=>[e.slot,e.x,e.y,e.shapeId,e.rows,e.lines,e.clear],matched=[];
  for(const run of data.matched.filter(r=>r.mode==='rollout')){
    const d=run.deals[0],root=data.roots[d.root];let state=patch(root.state,root.pool[d.index].tray);const events=[];
    for(let i=0;i<9&&state.status==='playing';i++){
      const move=rt.choose(state.board,state.tray,run.style,run.quantile);assert(move);const shapeId=state.tray[move.slot].shapeId;
      const a=rt.R.applyMove(state,move,state.revision);assert(a);state=a.state;
      events.push({...move,shapeId,rows:rt.A.toRows(state.board),lines:a.lines,clear:a.allClear});
    }
    assert.deepEqual(events.slice(0,3).map(compact),run.events.slice(0,3).map(compact));
    matched.push({input:run.input,group:run.group,style:run.style,quantile:run.quantile,
      actualRewards:run.events.filter(e=>e.clear).length,heldV2Rewards:events.filter(e=>e.clear).length,
      heldEvents:events,actualMoves:run.events.length,heldMoves:events.length,heldFinalHash:hash(state)});
  }
  const strong=[];
  for(const run of data.games.filter(r=>r.mode==='rollout'&&r.style==='three'))for(const d of run.deals){
    const actual=run.events.slice(d.at,d.at+9);if(actual.length<9&&!run.ended)continue;
    const root=data.roots[d.root],pred=root.forecasts['9'][d.index][3];
    assert.deepEqual(pred.events.slice(0,3).map(compact),actual.slice(0,3).map(compact));
    strong.push({group:run.group,seed:run.seed,at:d.at,predictedRewards:pred.rewards,
      actualRewards:actual.filter(e=>e.clear).length,predictedMoves:pred.moves,actualMoves:actual.length,
      changedFuture:run.deals.some(next=>next.at>d.at&&next.at<d.at+9&&next.index!==0)});
  }
  const groups={};
  for(const group of['engineering','development','confirmation']){
    const rows=matched.filter(r=>r.group===group);groups[group]={};
    for(const style of['bounded','three']){const part=rows.filter(r=>r.style===style);groups[group][style]={runs:part.length,
      actualRewards:part.reduce((n,r)=>n+r.actualRewards,0),heldV2Rewards:part.reduce((n,r)=>n+r.heldV2Rewards,0),
      actualOnlyWins:part.filter(r=>r.actualRewards>0&&!r.heldV2Rewards).length,
      heldOnlyWins:part.filter(r=>r.heldV2Rewards>0&&!r.actualRewards).length};}
  }
  const output={schema:'blocky-played-rollout-policy-audit-v1',resultSha256:hash(bytes),scriptSha256:hash(await fs.readFile('scripts/director/played-rollout/policy-audit.mjs')),
    note:'Post-hoc explanation, not a new candidate or acceptance test. Strong windows overlap.',groups,
    strongWindows:strong.length,strongRewardMismatches:strong.filter(r=>r.predictedRewards!==r.actualRewards).length,
    strongChangedFuture:strong.filter(r=>r.changedFuture).length,matched,strong};
  await fs.writeFile(`${out}/policy-audit.json`,JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(output).filter(([k])=>!['matched','strong'].includes(k)))));
}finally{await rt.server.close();}
