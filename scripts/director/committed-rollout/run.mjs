// D84 consistency regression first, then untouched fresh matched/game pilot.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {runtime,hash,sourceHashes,playerSeed} from '../architecture/runtime.mjs';
import {createPolicy,actors} from './policy.mjs';
const out='docs/qa/committed-rollout',rt=await runtime(),policy=await createPolicy(rt);
const extra=['scripts/director/committed-rollout/policy.mjs','scripts/director/committed-rollout/run.mjs',
  'scripts/director/played-rollout/dealer.mjs','scripts/director/local-choice/dealer.ts','docs/qa/committed-rollout/protocol.md',
  'docs/qa/played-rollout/results.json.gz','docs/qa/played-rollout/policy-audit.json'];
const source={...await sourceHashes(),...Object.fromEntries(await Promise.all(extra.map(async p=>[p,hash(await fs.readFile(p))])))};
const regressions=[],sourceGames=[],inputs=[],missing=[],matched=[],games=[],forks=[];
const rollsFor=seed=>{let rng=playerSeed(seed);return Array.from({length:240},()=>{const r=rt.R.random(rng);rng=r.state;return r.value;});};
const compact=e=>[e.slot,e.x,e.y,e.shapeId,e.rows,e.lines,e.clear];
async function save(name){await fs.writeFile(`${out}/${name}.json.gz`,gzipSync(JSON.stringify({schema:'blocky-committed-rollout-v1',source,
  regressions,sourceGames,inputs,missing,matched,games,forks,roots:policy.roots})));}
try{
  const old=JSON.parse(gunzipSync(await fs.readFile('docs/qa/played-rollout/results.json.gz'))),audit=JSON.parse(await fs.readFile('docs/qa/played-rollout/policy-audit.json'));
  for(const a of audit.matched){
    const previous=old.matched.find(r=>r.mode==='rollout'&&r.input===a.input&&r.style===a.style&&r.quantile===a.quantile);assert(previous);
    const run=policy.play(previous.initialState,previous.deals[0].proof,'hold',a.style,Array(9).fill(a.quantile),9);
    assert.deepEqual(run.events.map(compact),a.heldEvents.map(compact));assert.equal(run.finalHash,a.heldFinalHash);
    regressions.push({oldInput:a.input,seed:old.inputs[a.input].seed,quantile:a.quantile,...run});
  }
  assert.equal(regressions.length,55);
  assert(regressions.find(r=>r.seed===3301002&&r.style==='bounded'&&r.quantile===.125).events[8].clear);
  await save('regression-checkpoint');console.log(JSON.stringify({stage:'known-regression',cases:55,exact:true,example3301002RewardAt:9}));
  for(const[group,offset]of[['development',3441000],['confirmation',3461000]])for(let i=1;i<=4;i++){
    const seed=offset+i,first=policy.dealer.initial(seed,`committed-rollout-source-${seed}`),initial=first.state;
    let state=initial,proof=first.proof;const events=[],rolls=rollsFor(seed);
    while(state.status==='playing'&&state.moves<12){
      const before=state,roll=rolls[state.moves],move=rt.choose(state.board,state.tray,'bounded',roll);assert(move);
      const shapeId=state.tray[move.slot].shapeId,a=rt.R.applyMove(state,move,state.revision);assert(a);state=a.state;
      events.push({...move,roll,shapeId,rows:rt.A.toRows(state.board),lines:a.lines,clear:a.allClear});
      if(state.moves===12)proof=policy.dealer.describeRefill(before,a);
    }
    if(state.moves!==12||state.board.every(x=>!x))missing.push({group,seed,reason:state.moves!==12?'ended-before12':'empty-at12'});
    else inputs.push({group,seed,state,proof,sourceGame:sourceGames.length});
    sourceGames.push({group,seed,initial,events,finalHash:hash(state)});
  }
  console.log(JSON.stringify({stage:'fresh-sources',games:sourceGames.length,inputs:inputs.length,missing}));
  for(const[inputIndex,input]of inputs.entries()){
    for(const[style,quantiles]of[['bounded',[.125,.375,.625,.875]],['three',[0]]])for(const quantile of quantiles)for(const mode of['v2','short','replan','hold']){
      const begin=performance.now(),before=hash(input.state),run=policy.play(input.state,input.proof,mode,style,Array(9).fill(quantile),9);
      assert.equal(hash(input.state),before);matched.push({input:inputIndex,group:input.group,seed:input.seed,quantile,...run,ms:performance.now()-begin});
    }
    await save('matched-checkpoint');
    console.log(JSON.stringify({stage:'matched',input:inputIndex,group:input.group,seed:input.seed,
      rewards:Object.fromEntries(['v2','short','replan','hold'].map(m=>[m,matched.filter(r=>r.input===inputIndex&&r.mode===m&&r.style==='bounded').reduce((n,r)=>n+r.events.filter(e=>e.clear).length,0)]))}));
  }
  await fs.rm(`${out}/regression-checkpoint.json.gz`);
  for(const[group,offset]of[['development',3441000],['confirmation',3461000]])for(let i=1;i<=2;i++)for(const style of['bounded','three'])for(const mode of['v2','short','replan','hold']){
    const seed=offset+i,first=policy.dealer.initial(seed,`committed-rollout-${group}-${seed}-${style}`),begin=performance.now();
    const run=policy.play(first.state,first.proof,mode,style,rollsFor(seed),240);
    games.push({group,seed,...run,ms:performance.now()-begin});await save('games-checkpoint');
    console.log(JSON.stringify({stage:'game',group,seed,style,mode,moves:run.events.length,ended:run.ended,
      rewards:run.events.filter(e=>e.clear).length,roots:policy.roots.length,seconds:(performance.now()-begin)/1000}));
  }
  // Execute the new policy machine with a selected current tray as fixed input.
  // This does not recompute/tune the choice and cannot append decision roots.
  const decisionRoots=policy.roots.filter(r=>r.selections['9']),rootCount=policy.roots.length;
  for(const[ri,root]of decisionRoots.entries())for(const[actorIndex,actor]of actors.entries()){
    const index=root.selections['9'].index,expected=root.forecasts['9'][index][actorIndex];
    const run=policy.play(root.state,root.pool[0],'hold',actor.style,Array(9).fill(actor.roll),9,{root:root.id,index});
    assert.deepEqual(run.events.map(compact),expected.events.map(compact));assert.equal(run.finalHash,expected.finalHash);
    forks.push({root:root.id,index,actor:actorIndex,events:run.events,boundaries:run.boundaries,finalHash:run.finalHash,
      ended:run.ended,censored:run.censored,deals:run.deals.map(d=>{const{base,...rest}=d;return{...rest,baseHash:hash(base)};})});
    if(actorIndex===3&&(ri+1)%80===0)console.log(JSON.stringify({stage:'consistency-forks',done:ri+1,total:decisionRoots.length}));
  }
  assert.equal(policy.roots.length,rootCount);
  assert.deepEqual(await sourceHashes(),Object.fromEntries(Object.entries(source).filter(([p])=>!extra.includes(p))));
  for(const p of extra)assert.equal(hash(await fs.readFile(p)),source[p]);
  await save('results');await fs.rm(`${out}/matched-checkpoint.json.gz`);await fs.rm(`${out}/games-checkpoint.json.gz`);
  console.log(JSON.stringify({output:`${out}/results.json.gz`,regressions:regressions.length,inputs:inputs.length,
    matched:matched.length,games:games.length,roots:policy.roots.length,consistencyForks:forks.length}));
}finally{await rt.server.close();}
