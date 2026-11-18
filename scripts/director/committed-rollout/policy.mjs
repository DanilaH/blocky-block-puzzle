// D84 offline execution schedule. Frozen D83 selection is imported unchanged.
import assert from 'node:assert/strict';
import {hash} from '../architecture/runtime.mjs';
import {createDealer,actors} from '../played-rollout/dealer.mjs';
export {actors};
export async function createPolicy(rt){
  const dealer=await createDealer(rt);
  function play(initialState,proof,mode,style,rolls,cap=9,forcedFirst=null){
    let state=structuredClone(initialState),remaining=0;const deals=[],events=[],boundaries=[];
    const underlying=mode==='replan'||mode==='hold'?'rollout':mode;
    function issue(p,first=false){
      const base=state;let choice,action;
      if(mode==='hold'&&!first&&remaining>0){
        remaining--;choice={state,root:null,index:0};action='v2-continuation';
      }else{
        if(first&&forcedFirst){
          assert.equal(mode,'hold');const root=dealer.roots[forcedFirst.root];
          assert.equal(root.inputHash,hash(state));assert.equal(root.selections['9'].index,forcedFirst.index);
          choice={state:dealer.patch(state,root.pool[forcedFirst.index].tray),root:root.id,index:forcedFirst.index};
        }else choice=dealer.select(state,p,underlying);
        action=mode==='v2'?'v2':'select';remaining=mode==='hold'?2:0;
      }
      state=choice.state;
      assert.equal(state.rngState,base.rngState);assert.deepEqual(state.goalDirector,base.goalDirector);
      deals.push({at:events.length,action,remaining,base:structuredClone(base),
        proof:{tray:p.tray,witness:p.witness,fallback:p.fallback},root:choice.root,index:choice.index,forced:Boolean(first&&forcedFirst)});
    }
    issue(proof,true);
    while(state.status==='playing'&&events.length<cap){
      const before=state,roll=rolls[events.length],move=dealer.player(state.board,state.tray,style,roll);assert(move);
      const shapeId=state.tray[move.slot].shapeId,refill=state.tray.filter(s=>!s.used).length===1;
      const a=rt.R.applyMove(state,move,state.revision);assert(a);state=a.state;
      events.push({...move,roll,shapeId,rows:rt.A.toRows(state.board),lines:a.lines,clear:a.allClear});
      if(refill){boundaries.push({at:events.length,baseHash:hash(state)});
        if(events.length<cap&&state.status==='playing')issue(dealer.describeRefill(before,a));}
    }
    return{mode,style,cap,initialState,deals,events,boundaries,finalHash:hash(state),ended:state.status==='over',
      censored:state.status==='playing'&&events.length===cap,earned:events.some(e=>e.clear)};
  }
  return{dealer,play,roots:dealer.roots};
}
