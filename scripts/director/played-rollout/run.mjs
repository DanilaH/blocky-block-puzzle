// D83 matched inputs and complete-game pilot, frozen before collection.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {runtime,hash,sourceHashes,playerSeed} from '../architecture/runtime.mjs';
import {createDealer} from './dealer.mjs';
const out='docs/qa/played-rollout',rt=await runtime(),dealer=await createDealer(rt);
const extra=['scripts/director/played-rollout/dealer.mjs','scripts/director/played-rollout/run.mjs',
  'scripts/director/local-choice/dealer.ts','docs/qa/played-rollout/protocol.md'];
const source={...await sourceHashes(),...Object.fromEntries(await Promise.all(extra.map(async p=>[p,hash(await fs.readFile(p))])))};
const sourceGames=[],inputs=[],missing=[],matched=[],games=[];
const rollsFor=seed=>{let state=playerSeed(seed);return Array.from({length:240},()=>{const r=rt.R.random(state);state=r.state;return r.value;});};
function maybeInput(group,seed,state,proof,sourceIndex){
  if(state.moves!==12){missing.push({group,seed,reason:'ended-before12'});return;}
  if(state.board.every(x=>!x)){missing.push({group,seed,reason:'empty-at12'});return;}
  inputs.push({group,seed,state:structuredClone(state),proof,sourceGame:sourceIndex});
}
async function save(name){await fs.writeFile(`${out}/${name}.json.gz`,gzipSync(JSON.stringify({schema:'blocky-played-rollout-v1',source,
  sourceGames,inputs,missing,matched,games,roots:dealer.roots})));}
try{
  const previous=JSON.parse(await fs.readFile('docs/qa/branch-preparation/results.json'));
  for(const old of previous.sourceGames.slice(0,4)){
    let state=structuredClone(old.initial),proof=null;const events=[];
    for(const e of old.steps.slice(0,12)){const before=state,a=rt.R.applyMove(state,e.move,state.revision);assert(a);state=a.state;
      assert.deepEqual(rt.A.toRows(state.board),e.rows);events.push(e);
      if(state.moves===12)proof=dealer.describeRefill(before,a);}
    maybeInput('engineering',old.seed,state,proof,sourceGames.length);
    sourceGames.push({group:'engineering',seed:old.seed,initial:old.initial,events,finalHash:hash(state)});
  }
  for(const[group,offset]of[['development',3301000],['confirmation',3321000]])for(let i=1;i<=4;i++){
    const seed=offset+i,first=dealer.initial(seed,`played-rollout-source-${seed}`),initial=first.state;
    let state=initial,proof=first.proof;const events=[],rolls=rollsFor(seed);
    while(state.status==='playing'&&state.moves<12){const before=state,roll=rolls[state.moves],move=rt.choose(state.board,state.tray,'bounded',roll);assert(move);
      const a=rt.R.applyMove(state,move,state.revision);assert(a);state=a.state;events.push({roll,move,rows:rt.A.toRows(state.board),lines:a.lines,clear:a.allClear});
      if(state.moves===12)proof=dealer.describeRefill(before,a);}
    maybeInput(group,seed,state,proof,sourceGames.length);
    sourceGames.push({group,seed,initial,events,finalHash:hash(state)});
  }
  await save('source-checkpoint');
  console.log(JSON.stringify({stage:'sources',games:sourceGames.length,inputs:inputs.length,missing}));
  for(const[inputIndex,input]of inputs.entries()){
    for(const[style,quantiles]of[['bounded',[.125,.375,.625,.875]],['three',[0]]])for(const quantile of quantiles)for(const mode of['v2','short','rollout']){
      const before=hash(input.state),begin=performance.now();
      const played=dealer.play(input.state,input.proof,mode,style,Array(9).fill(quantile),9,false);
      assert.equal(hash(input.state),before);matched.push({input:inputIndex,group:input.group,seed:input.seed,quantile,...played,ms:performance.now()-begin});
    }
    await save('matched-checkpoint');
    console.log(JSON.stringify({stage:'matched',input:inputIndex,group:input.group,seed:input.seed,
      rows:matched.filter(r=>r.input===inputIndex).map(r=>[r.mode,r.style,r.quantile,r.events.length,r.events.filter(e=>e.clear).length])}));
  }
  await fs.rm(`${out}/source-checkpoint.json.gz`);
  for(const[group,offset]of[['development',3301000],['confirmation',3321000]])for(let i=1;i<=2;i++)for(const style of['bounded','three'])for(const mode of['v2','short','rollout']){
    const seed=offset+i,first=dealer.initial(seed,`played-rollout-${group}-${seed}-${style}`),begin=performance.now();
    const played=dealer.play(first.state,first.proof,mode,style,rollsFor(seed),240,false);
    games.push({group,seed,...played,ms:performance.now()-begin});await save('games-checkpoint');
    console.log(JSON.stringify({stage:'game',group,seed,style,mode,moves:played.events.length,ended:played.ended,
      rewards:played.events.filter(e=>e.clear).length,roots:dealer.roots.length,seconds:(performance.now()-begin)/1000}));
  }
  assert.deepEqual(await sourceHashes(),Object.fromEntries(Object.entries(source).filter(([p])=>!extra.includes(p))));
  for(const p of extra)assert.equal(hash(await fs.readFile(p)),source[p]);
  await save('results');await fs.rm(`${out}/matched-checkpoint.json.gz`);await fs.rm(`${out}/games-checkpoint.json.gz`);
  console.log(JSON.stringify({output:`${out}/results.json.gz`,sources:sourceGames.length,inputs:inputs.length,
    matched:matched.length,games:games.length,roots:dealer.roots.length}));
}finally{await rt.server.close();}
