/** Seen-seed causal audit only. Raw state/trace remains ignored. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const out='artifacts/challenge-balance';await fs.mkdir(out,{recursive:true});
const old=JSON.parse(await fs.readFile('artifacts/challenge-content/development-r3.json','utf8')).games;
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
try{
 const R=await server.ssrLoadModule('/src/core/rules.ts'),P=await server.ssrLoadModule('/scripts/director/mixed-players.ts'),C=await server.ssrLoadModule('/src/platform/play-capture.ts');
 const games=[],cases=[];const ids=d=>d.tray.map(s=>s.shapeId).join(),key=g=>JSON.stringify({board:g.board,tray:g.tray,rng:g.rngState,goal:g.goalDirector,rhythm:g.rhythm});
 function route(board,tray,witness){let b=board,lines=0,clears=0;for(const m of witness){const n=R.place(b,R.shapeById(tray[m.slot].shapeId),m.x,m.y);b=n.board;lines+=n.lines;clears+=Number(b.every(v=>!v));}return{lines,clears,endOccupied:b.filter(Boolean).length};}
 for(const style of ['clear','lapse'])for(let seed=8105001;seed<=8105008;seed++)for(const starts of [false,true]){
  const arm=starts?'full':'tasks',reference=starts?'starts':'control';let trajectories={};
  for(const mode of ['original','restore-miss']){
   let player=(seed^0x85ebca6b)>>>0,active=0,initial;
   let g=R.newGame(seed,`challenge-development-r3-${style}-${seed}-${arm}`,'director-challenge-v1',t=>initial=t,arm);
   const r={style,seed,arm,mode,moves:0,allClears:0,ordinary:0,refills:0,physicalChanges:0,unselectedChanges:0,tasklessChanges:0,lostRewardWitness:0,lostLineWitness:0,selectedChanges:0,restored:0,first:null};
   while(g.status==='playing'&&g.moves<300){
    const roll=R.random(player);player=roll.state;active+=style==='clear'?1500:2400;
    const move=P.chooseMixed(g.board,g.tray,style,roll.value).move;assert(move);
    const before=g,result=R.applyMove(g,move,g.revision,true,{activeMs:active});assert(result);g=result.state;
    r.allClears+=Number(result.allClear);r.ordinary+=Number(result.lines>0&&!result.allClear);
    if(result.decision){
     r.refills++;const t=result.decision,i=t.input,c=i.context;
     const d=R.deal(i.board,i.seed,'director-v2',i.moves,i.previous,c.rhythm,c.director,c.goalDirector);
     const changed=ids(d)!==ids(g)||d.rngState!==g.rngState||JSON.stringify(d.goalDirector)!==JSON.stringify(g.goalDirector);
     const a=route(i.board,g.tray,t.validation.witness),b=route(i.board,d.tray,d.witness);
     const selected=t.challenge.selected,task=t.challenge.task;
     if(changed){
      r.physicalChanges++;r.unselectedChanges+=Number(!selected);r.tasklessChanges+=Number(!['CHAIN','CHOICE'].includes(task));r.selectedChanges+=Number(selected);
      r.lostRewardWitness+=Number(a.clears<b.clears);r.lostLineWitness+=Number(a.lines<b.lines);
      if(!r.first)r.first={at:g.moves,selected,task,reportedChanged:t.challenge.changedHand,actualIds:g.tray.map(s=>s.shapeId),baselineIds:d.tray.map(s=>s.shapeId),actual:a,baseline:b};
      if(cases.filter(x=>x.style===style&&x.arm===arm&&x.mode===mode).length<6)cases.push({style,seed,arm,mode,at:g.moves,input:i,trace:t,baseline:d,actual:a,baselineReward:b});
     }
     if(mode==='restore-miss'&&t.challenge.focus&&!selected){
      const control=R.applyMove({...before,dealerVersion:'director-v2'},move,before.revision,true);assert(control);
      assert.equal(ids(control.state),ids(d));assert.equal(control.state.rngState,d.rngState);
      g={...control.state,dealerVersion:'director-challenge-v1',challengeState:g.challengeState};r.restored+=Number(changed);
     }
    }
   }
   r.moves=g.moves;r.ended=g.status==='over';r.finalHash=C.stateHash(g);trajectories[mode]=r;
   if(mode==='original'){const expected=old.find(x=>x.seed===seed&&x.style===style&&x.arm===arm);assert.equal(r.finalHash,expected.finalHash,'R3 changed');assert.equal(r.moves,expected.moves);assert.equal(r.allClears,expected.allClears);}
   games.push(r);console.log(`${games.length}/64 ${style} ${seed} ${arm} ${mode} m=${r.moves} reward=${r.allClears} changes=${r.physicalChanges} miss=${r.unselectedChanges} lost=${r.lostRewardWitness}/${r.lostLineWitness}`);
  }
 }
 await fs.writeFile(`${out}/diagnosis.json`,JSON.stringify({provenance:'Synthetic seen-seed causal diagnosis, not validation',games},null,2)+'\n');
 await fs.writeFile(`${out}/diagnosis.cases.json`,JSON.stringify(cases,null,2)+'\n');
}finally{await server.close();}
