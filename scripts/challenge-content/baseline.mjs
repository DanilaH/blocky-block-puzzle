/** Synthetic source census. Raw snapshots stay under ignored artifacts. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";
const out=process.argv[2]??"artifacts/challenge-content";
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
try {
  const R=await server.ssrLoadModule('/src/core/rules.ts');
  const P=await server.ssrLoadModule('/scripts/director/mixed-players.ts');
  const V=await server.ssrLoadModule('/scripts/director/goal-certificates.ts');
  const C=await server.ssrLoadModule('/src/platform/play-capture.ts');
  const games=[],cases=[];
  function inspect(t,d) {
    let board=t.input.board,lines=0,firstClearAt=0,unlocked=false;
    const initial=d.tray.map(s=>R.placements(board,R.shapeById(s.shapeId)).length);
    const used=new Set();
    for(const [index,m] of d.witness.entries()) {
      assert(!used.has(m.slot));used.add(m.slot);
      assert(R.fits(board,R.shapeById(d.tray[m.slot].shapeId),m.x,m.y));
      if(initial[m.slot]===0&&lines>0)unlocked=true;
      const n=R.place(board,R.shapeById(d.tray[m.slot].shapeId),m.x,m.y);board=n.board;
      if(n.lines&&!firstClearAt)firstClearAt=index+1;lines+=n.lines;
    }
    assert.equal(used.size,3);
    const certificate=d.diagnostic?.certificate?.kind??null;
    return {initialSlots:initial.filter(Boolean).length,initialMoves:initial.reduce((a,b)=>a+b,0),chain:unlocked,certificate,firstClearAt,lines,
      kind:unlocked?'CHAIN':certificate==='placement'?'CHOICE':certificate==='reward-choice'?'REWARD_CHOICE':certificate==='slot-order'?'ORDER':'ORDINARY'};
  }
  for(const style of ['bounded','clear','three','lapse'])for(let seed=8101001;seed<=8101008;seed++)for(const policy of ['director-v2','composition-v2']) {
    let trace,g=R.newGame(seed,`content-baseline-${style}-${seed}-${policy}`,policy,t=>trace=t),player=(seed^0x85ebca6b)>>>0;
    const row={seed,style,policy,moves:0,ended:false,deals:0,eligibleDeals:0,lines:0,ordinary:0,allClears:0,lateMoves:0,lateRewards:0,fallback:0,
      kinds:{},lateKinds:{},sources:{},work:[],generationMs:[],initialMoves:[]};
    function issued(t,before) {
      const i=t.input,c=i.context,d=R.deal(i.board,i.seed,i.policy,i.moves,i.previous,c.rhythm,c.director,c.goalDirector,c.mixedDirector,c.forgivingDirector,c.rewardDirector,c.assistBudget);
      assert.deepEqual(d.tray,g.tray);assert.equal(d.rngState,g.rngState);
      const a=inspect(t,d);row.deals++;row.kinds[a.kind]=(row.kinds[a.kind]??0)+1;
      const source=d.diagnostic?.source??d.composition?.reason??'unknown';row.sources[source]=(row.sources[source]??0)+1;
      row.work.push(t.validation.work);assert(t.validation.work<=t.validation.limit);row.fallback+=Number(d.fallback);
      row.initialMoves.push(a.initialMoves);
      if(i.moves>=36){row.eligibleDeals++;row.lateKinds[a.kind]=(row.lateKinds[a.kind]??0)+1;}
      const key=`${policy}:${a.kind}`;
      if(cases.filter(x=>x.key===key).length<2){
        if(d.diagnostic?.certificate)V.verifyGoalDeal(i.board,d);
        cases.push({key,seed,style,at:g.moves,before,expectedHash:C.stateHash(g),trace:t,assessment:a});
      }
    }
    issued(trace,{initialSeed:seed,policy});
    while(g.status==='playing'&&g.moves<300) {
      const roll=R.random(player);player=roll.state;const move=P.chooseMixed(g.board,g.tray,style,roll.value).move;assert(move);
      const previous=g,refill=g.tray.filter(s=>!s.used).length===1,at=performance.now();
      const next=R.applyMove(g,move,g.revision,true);assert(next);const duration=performance.now()-at;g=next.state;
      if(refill)row.generationMs.push(duration);
      row.lines+=next.lines;row.ordinary+=Number(next.lines>0&&!next.allClear);row.allClears+=Number(next.allClear);
      if(g.moves>72){row.lateMoves++;row.lateRewards+=Number(next.allClear);}
      if(next.decision)issued(next.decision,{state:previous,move});
    }
    row.moves=g.moves;row.ended=g.status==='over';games.push(row);
    await fs.mkdir(out,{recursive:true});
    await fs.writeFile(`${out}/baseline.json`,JSON.stringify({provenance:'Synthetic only',cap:300,games},null,2)+'\n');
    await fs.writeFile(`${out}/baseline.cases.json`,JSON.stringify(cases,null,2)+'\n');
    console.log(`${games.length}/64 ${style} ${seed} ${policy} ${g.moves} ${row.ended?'ended':'censored'} ${JSON.stringify(row.kinds)}`);
  }
} finally {await server.close();}
