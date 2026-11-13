import {SHAPES,type Move} from './rules';
import {catalog,canPlace,transition,proveIds,type WorkBudget,type Rows,type Operation} from './director-search';
import {boardGeometry,proveRewardTail} from './director-goal-tools';

export interface RootProof {
  move:Move;value:number;immediateClear:boolean;
  status:'found'|'unsolvable'|'unknown';witness:Move[]|null;
  goalStatus:'found'|'unsolvable'|'unknown'|null;goalWitness:Move[]|null;
  seconds?: {required:number;complete:boolean;choices:SecondProof[]};
}
export interface SecondProof {
  move:Move;value:number;status:'found'|'unsolvable'|'unknown';witness:Move[]|null;
}
export interface Robustness {
  adequate:boolean;required:number;safe:number;unknown:number;rewardSafe:number;roots:RootProof[];
  secondRequired?:number;
  obviousReward?:boolean;
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
  return {...r,roots:r.roots.map(p=>({...p,move:move(p.move),witness:p.witness?.map(move)??null,goalWitness:p.goalWitness?.map(move)??null,
    ...(p.seconds?{seconds:{...p.seconds,choices:p.seconds.choices.map(s=>({...s,move:move(s.move),witness:s.witness?.map(move)??null}))}}:{})}))};
}

// v3 keeps its original assessment above so an existing save replays exactly.
// v4 certifies a rectangle of plausible first AND second choices in soft phases.
export function assessForgivingTrio(rows:Rows,path:Operation[],meter:WorkBudget,soft:boolean,wantReward=false):Robustness {
  if(!soft)return assessTrio(rows,path,meter,2,wantReward);
  const ids=path.map(o=>o.shape),required=3,secondRequired=soft?3:0;
  const result:Robustness={adequate:false,required,safe:0,unknown:0,rewardSafe:0,roots:[],secondRequired};
  function options(board:Rows,slots:number[]){
    const choices:{move:Move;rows:Rows;clear:boolean;value:number}[]=[],seen=new Set<string>();let complete=true;
    outer:for(const slot of slots)for(const op of catalog()[ids[slot]!]!){
      const key=op.shape+':'+op.x+','+op.y;if(seen.has(key))continue;seen.add(key);
      const fits=canPlace(board,op,meter);if(fits===null){complete=false;break outer;}if(!fits)continue;
      const next=transition(board,op,meter);if(!next){complete=false;break outer;}
      const g=boardGeometry(next.rows);
      choices.push({move:{slot,x:op.x,y:op.y},rows:next.rows,clear:next.clear,
        value:next.lines*160-g.holes*30-g.edges-g.occupied*2});
    }
    choices.sort((a,b)=>b.value-a.value);return {choices,complete};
  }
  function mapped(prefix:Move[],tail:Operation[]){
    const used=new Set(prefix.map(m=>m.slot));return [...prefix,...tail.map(op=>{
      const slot=ids.findIndex((id,i)=>id===op.shape&&!used.has(i));
      if(slot<0)throw Error('Forgiving tail slot invariant');used.add(slot);return {slot,x:op.x,y:op.y};
    })];
  }
  const first=options(rows,[0,1,2]);
  if(!first.complete)return result; // A truncated ranking cannot certify its top choices.
  for(const c of first.choices.slice(0,required)){
    const left=[0,1,2].filter(i=>i!==c.move.slot),proof=proveIds(c.rows,left.map(i=>ids[i]!),meter);
    const root:RootProof={move:c.move,value:c.value,immediateClear:c.clear,status:proof.status,
      witness:proof.path?mapped([c.move],proof.path):null,goalStatus:null,goalWitness:null};
    result.roots.push(root);result.safe+=Number(proof.status==='found');result.unknown+=Number(proof.status==='unknown');
    if(!proof.path)return result;
    if(soft){
      const second=options(c.rows,left);
      root.seconds={required:secondRequired,complete:second.complete,choices:[]};
      if(!second.complete||second.choices.length<secondRequired)return result;
      for(const s of second.choices.slice(0,secondRequired)){
        const last=options(s.rows,left.filter(i=>i!==s.move.slot)),best=last.choices[0];
        const status=best?'found':last.complete?'unsolvable':'unknown';
        root.seconds.choices.push({move:s.move,value:s.value,status,witness:best?[c.move,s.move,best.move]:null});
        if(!best)return result;
      }
    }
  }
  if(result.safe<required)return result;
  // Preserve survival and the reward as separate claims. Losing the target
  // does not imply that a remainder is unplayable.
  if(wantReward)for(const root of result.roots){
    const c=first.choices.find(c=>c.move===root.move)!,left=ids.filter((_,i)=>i!==root.move.slot);
    if(root.seconds){
      root.goalStatus='unknown'; // Only sampled seconds, never a negative proof.
      for(const s of root.seconds.choices){
        const op=catalog()[ids[s.move.slot]!]!.find(o=>o.x===s.move.x&&o.y===s.move.y)!,next=transition(c.rows,op,meter);if(!next)break;
        const goal=proveRewardTail(next.rows,ids.filter((_,i)=>i!==root.move.slot&&i!==s.move.slot),meter,c.clear||next.clear);
        if(goal.path){root.goalStatus='found';root.goalWitness=mapped([root.move,s.move],goal.path);result.rewardSafe++;
          if(root===result.roots[0]&&(c.clear||s===root.seconds.choices[0]&&next.clear))result.obviousReward=true;
          break;}
        if(goal.status==='unknown')break;
      }
    }else{
      const goal=proveRewardTail(c.rows,left,meter,c.clear);root.goalStatus=goal.status;
      if(goal.path){root.goalWitness=mapped([root.move],goal.path);result.rewardSafe++;}
    }
    if(result.rewardSafe>=2||result.obviousReward)break;
    if(meter.used>=meter.ceiling)break;
  }
  result.adequate=!wantReward||result.rewardSafe>=2||!!result.obviousReward;
  return result;
}
