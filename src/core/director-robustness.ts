import {SHAPES,type Move} from './rules';
import {catalog,canPlace,transition,proveIds,type WorkBudget,type Rows,type Operation} from './director-search';
import {boardGeometry,proveRewardTail} from './director-goal-tools';

export interface RootProof {
  move:Move;value:number;immediateClear:boolean;
  status:'found'|'unsolvable'|'unknown';witness:Move[]|null;
  goalStatus:'found'|'unsolvable'|'unknown'|null;goalWitness:Move[]|null;
}
export interface Robustness {
  adequate:boolean;required:number;safe:number;unknown:number;rewardSafe:number;roots:RootProof[];
}
export function assessTrio(rows:Rows,path:Operation[],meter:WorkBudget,required=2,wantReward=false):Robustness {
  const ids=path.map(o=>o.shape),options:{op:Operation;slot:number;rows:Rows;clear:boolean;value:number}[]=[],seen=new Set<string>();
  const result:Robustness={adequate:false,required,safe:0,unknown:0,rewardSafe:0,roots:[]};
  outer:for(let slot=0;slot<3;slot++)for(const op of catalog()[ids[slot]!]!){
    const key=op.shape+':'+op.x+','+op.y;if(seen.has(key))continue;seen.add(key);
    const fits=canPlace(rows,op,meter);if(fits===null)break outer;if(!fits)continue;
    const next=transition(rows,op,meter);if(!next)break outer;const g=boardGeometry(next.rows);
    // This board-only heuristic is separate from the evaluation players.
    const value=next.lines*120-g.holes*30-g.edges-Math.abs(g.occupied-18)*.4;
    options.push({op,slot,rows:next.rows,clear:next.clear,value});
  }
  options.sort((a,b)=>b.value-a.value);
  function mapped(first:Move,tail:Operation[]){
    const used=new Set([first.slot]);return [first,...tail.map(op=>{
      const slot=ids.findIndex((id,i)=>id===op.shape&&!used.has(i));if(slot<0)throw Error('Tail slot invariant');used.add(slot);
      return {slot,x:op.x,y:op.y};
    })];
  }
  for(const c of options.slice(0,6)){
    const move={slot:c.slot,x:c.op.x,y:c.op.y},remaining=ids.filter((_,i)=>i!==c.slot),proof=proveIds(c.rows,remaining,meter);
    const root:RootProof={move,value:c.value,immediateClear:c.clear,status:proof.status,witness:proof.path?mapped(move,proof.path):null,goalStatus:null,goalWitness:null};
    result.roots.push(root);result.safe+=Number(!!proof.path);result.unknown+=Number(proof.status==='unknown');
    // The best plausible beginnings must all remain viable. A lower-ranked
    // witness cannot conceal an immediately fatal-looking first move.
    if(result.roots.length<=required&&!proof.path)break;
    if(proof.path&&wantReward){
      const goal=proveRewardTail(c.rows,remaining,meter,c.clear);root.goalStatus=goal.status;
      if(goal.path){root.goalWitness=mapped(move,goal.path);result.rewardSafe++;}
    }
    const prefix=result.roots.length>=required&&result.roots.slice(0,required).every(r=>r.status==='found');
    const broadReward=!wantReward||result.rewardSafe>=2||result.roots[0]?.immediateClear&&result.roots[0]?.goalStatus==='found';
    if(prefix&&result.safe>=3&&broadReward){result.adequate=true;break;}
    if(proof.status==='unknown'||meter.used>=meter.ceiling)break;
  }
  return result;
}

export function remapRobustness(r:Robustness,permutation:number[]):Robustness {
  const move=(m:Move):Move=>({...m,slot:permutation.indexOf(m.slot)});
  return {...r,roots:r.roots.map(p=>({...p,move:move(p.move),witness:p.witness?.map(move)??null,goalWitness:p.goalWitness?.map(move)??null}))};
}
