// D83 offline wrapper. Forecast future policy is frozen v2; actual play replans.
import assert from 'node:assert/strict';
import {hash} from '../architecture/runtime.mjs';
export const actors=[{style:'bounded',roll:0},{style:'bounded',roll:.5},{style:'bounded',roll:.999999},{style:'three',roll:0}];
export async function createDealer(rt){
  const L=await rt.server.ssrLoadModule('/scripts/director/local-choice/dealer.ts');
  const roots=[],cache=new Map(),bounded=new Map(),strong=new Map(),privateRuns=new Map();
  const signature=tray=>tray.map(s=>rt.R.shapeById(s.shapeId).family).sort().join(',');
  function memo(map,key,value,max=30000){map.set(key,value);if(map.size>max)map.delete(map.keys().next().value);return value;}
  function player(board,tray,style,roll){
    const key=rt.A.toRows(board).join(',')+'|'+tray.map(s=>s.shapeId+':'+Number(s.used)).join(',');
    if(style==='bounded'){
      let options=bounded.get(key);if(!options)options=memo(bounded,key,rt.MP.boundedOptions(board,tray));
      return options[Math.min(options.length-1,Math.floor(roll*options.length))]?.move??null;
    }
    if(!strong.has(key))memo(strong,key,rt.choose(board,tray,'three',0));return strong.get(key);
  }
  function patch(state,tray){
    return{...state,tray:structuredClone(tray),status:rt.R.hasMove(state.board,tray)?'playing':'over',
      rhythm:{...state.rhythm,recentBags:[...(state.rhythm?.recentBags??[]).slice(0,-1),signature(tray)]}};
  }
  function verifyProof(board,candidate){rt.verify(board,candidate);}
  function rootFor(state,proof){
    const key=hash(state);if(cache.has(key))return roots[cache.get(key)];
    assert.deepEqual(state.tray,proof.tray);const before=hash(state);
    const proposed=L.localChoiceDeal(state.board,state.rngState,state.moves,{sinceClear:state.rhythm?.cycleMoves??state.moves,
      recentBags:state.rhythm?.recentBags??[]});
    const pool=[{source:'director-v2',tray:structuredClone(state.tray),witness:proof.witness,fallback:proof.fallback}];
    const ids=new Set([state.tray.map(s=>s.shapeId).join(',')]);
    for(const p of proposed.diagnostic.pool??[]){const k=p.tray.map(s=>s.shapeId).join(',');if(ids.has(k))continue;ids.add(k);
      pool.push({source:'c1:'+p.source,tray:p.tray,witness:p.witness,fallback:false});}
    if(proposed.fallback){const k=proposed.tray.map(s=>s.shapeId).join(',');if(!ids.has(k))pool.push({source:'c1:reserve',tray:proposed.tray,witness:proposed.witness,fallback:true});}
    pool.forEach(p=>verifyProof(state.board,p));assert.equal(hash(state),before);
    const root={id:roots.length,inputHash:key,state:structuredClone(state),pool,proposalChecks:proposed.diagnostic.checks,
      selections:{},forecasts:{},timings:{}};
    roots.push(root);memo(cache,key,root.id,512);
    if(roots.length%32===0)for(const k of privateRuns.keys())if(Number(k.split(':')[0])<roots.length-256)privateRuns.delete(k);
    return root;
  }
  function forecast(root,ci,ai,horizon){
    const key=`${root.id}:${ci}:${ai}`,actor=actors[ai];let run=privateRuns.get(key);
    if(!run){run={states:[patch(root.state,root.pool[ci].tray)],events:[],future:[]};privateRuns.set(key,run);}
    while(run.events.length<horizon&&run.states.at(-1).status==='playing'){
      const before=run.states.at(-1),move=player(before.board,before.tray,actor.style,actor.roll);
      assert(move);const shapeId=before.tray[move.slot].shapeId,refill=before.tray.filter(s=>!s.used).length===1;
      const applied=rt.R.applyMove(before,move,before.revision);assert(applied);const after=applied.state;
      run.events.push({...move,shapeId,rows:rt.A.toRows(after.board),lines:applied.lines,clear:applied.allClear});run.states.push(after);
      if(refill)run.future.push({at:run.events.length,tray:after.tray,rngState:after.rngState});
    }
    const n=Math.min(horizon,run.events.length),events=run.events.slice(0,n),end=run.states[n];
    const value={actor:ai,horizon,events,future:run.future.filter(d=>d.at<=n),finalHash:hash(end),
      firstComplete:n>=3,dead:end.status==='over',moves:n,lines:events.reduce((s,e)=>s+e.lines,0),
      clears:events.filter(e=>e.lines>0).length,rewards:events.filter(e=>e.clear).length};
    return value;
  }
  function assess(root,horizon){
    const name=String(horizon);if(root.selections[name])return root.selections[name];const begin=performance.now();
    const forecasts=root.pool.map((_,ci)=>actors.map((_,ai)=>forecast(root,ci,ai,horizon)));
    const base=forecasts[0],boundedLines=row=>row.slice(0,3).reduce((n,f)=>n+f.lines,0),totalLines=row=>row.reduce((n,f)=>n+f.lines,0);
    const assessments=forecasts.map((row,i)=>{
      const family=signature(root.pool[i].tray),repeats=(root.state.rhythm?.recentBags??[]).slice(0,-1).filter(s=>s===family).length;
      const eligible=row.every(f=>f.firstComplete)&&boundedLines(row)*100>=boundedLines(base)*95&&row[3].lines*100>=base[3].lines*95;
      const score=[row.slice(0,3).filter(f=>f.rewards>0).length,-Math.max(0,row[3].rewards-1),
        Math.min(...row.slice(0,3).map(f=>f.clears)),totalLines(row),-repeats,-i];
      return{index:i,eligible,score,boundedLines:boundedLines(row),strongLines:row[3].lines};
    });
    const ranked=assessments.filter(a=>a.eligible).sort((a,b)=>{for(let i=0;i<a.score.length;i++)if(a.score[i]!==b.score[i])return b.score[i]-a.score[i];return 0;});
    const selection={horizon,index:ranked[0]?.index??0,noEligible:!ranked.length,assessments};
    root.forecasts[name]=forecasts;root.selections[name]=selection;root.timings[name]=performance.now()-begin;return selection;
  }
  function select(state,proof,mode){
    if(mode==='v2')return{state,root:null,index:0};
    const root=rootFor(state,proof),selection=assess(root,mode==='short'?3:9),before=hash(state);
    const next=patch(state,root.pool[selection.index].tray);assert.equal(hash(state),before);
    assert.equal(next.rngState,state.rngState);assert.deepEqual(next.goalDirector,state.goalDirector);
    return{state:next,root:root.id,index:selection.index};
  }
  function initial(seed,id){const state={...rt.R.newGame(seed,id,'director-v2'),scoringVersion:'festival-v4',seriesBonusVersion:1};
    const proof=rt.R.deal(rt.R.emptyBoard(),seed,'director-v2');assert.deepEqual(state.tray,proof.tray);verifyProof(state.board,proof);return{state,proof};}
  function describeRefill(before,applied){
    const state=applied.state,rhythm=rt.H.advanceRhythmV4(before.rhythm,state.board,applied.lines,applied.allClear,rt.R.random(before.rngState).value),
      saved=rt.G.observeGoalDirector(before.goalDirector,applied.allClear);
    const proof=rt.R.deal(state.board,before.rngState,'director-v2',state.moves,signature(before.tray),rhythm,undefined,saved);
    assert.deepEqual(proof.tray,state.tray);assert.equal(proof.rngState,state.rngState);verifyProof(state.board,proof);return proof;
  }
  function play(initialState,proof,mode,style,rolls,cap,stopReward=false){
    let state=structuredClone(initialState);const deals=[],events=[];
    function issue(p){const base=state,choice=select(state,p,mode);state=choice.state;
      deals.push({at:events.length,base:structuredClone(base),proof:{tray:p.tray,witness:p.witness,fallback:p.fallback},root:choice.root,index:choice.index});}
    issue(proof);
    while(state.status==='playing'&&events.length<cap){
      const before=state,roll=rolls[events.length],move=player(state.board,state.tray,style,roll);assert(move);
      const shapeId=state.tray[move.slot].shapeId,refill=state.tray.filter(s=>!s.used).length===1;
      const applied=rt.R.applyMove(state,move,state.revision);assert(applied);state=applied.state;
      events.push({...move,roll,shapeId,rows:rt.A.toRows(state.board),lines:applied.lines,clear:applied.allClear});
      if(stopReward&&applied.allClear)break;
      if(refill&&events.length<cap&&state.status==='playing')issue(describeRefill(before,applied));
    }
    return{mode,style,cap,initialState,deals,events,finalHash:hash(state),ended:state.status==='over',
      censored:state.status==='playing'&&events.length===cap,earned:events.some(e=>e.clear)};
  }
  return{roots,player,patch,rootFor,assess,select,initial,describeRefill,play,signature};
}
