import {SHAPES,random,type Board} from './rules';
import {initialRhythmV4,type RhythmState} from './rhythm';
import {WorkBudget,POP,catalog,toRows,occupied,legalOperations,canPlace,transition,proveIds,packagePath,pathReward,type Operation} from './director-search';

export type DirectorKind='build'|'order'|'load'|'relief'|'rest'|'recovery'|'emergency';
export interface OrderDirectorState {version:1;deals:number;sinceLoad:number;rest:number;last:DirectorKind;}
export const initialOrderDirector=():OrderDirectorState=>({version:1,deals:0,sinceLoad:0,rest:0,last:'build'});
export function validOrderDirector(v:OrderDirectorState|undefined){
  return !!v&&v.version===1&&Number.isInteger(v.deals)&&v.deals>=0&&v.deals<=1000000&&
    Number.isInteger(v.sinceLoad)&&v.sinceLoad>=0&&v.sinceLoad<=32&&Number.isInteger(v.rest)&&v.rest>=0&&v.rest<=1&&
    ['build','order','load','relief','rest','recovery','emergency'].includes(v.last);
}
export function observeOrderDirector(d:OrderDirectorState,allClear:boolean):OrderDirectorState {
  return allClear?{...d,rest:1}:d;
}

export function orderDirectorDeal(board:Board,seed:number,moves=0,rhythm:RhythmState=initialRhythmV4(),saved=initialOrderDirector(),options:{guardLoad?:boolean;budget?:number}={}){
  const meter=new WorkBudget(options.budget),rows=toRows(board),count=occupied(rows);
  let rng=seed>>>0||1;
  const roll=()=>{const r=random(rng);rng=r.state;return r.value;};
  const pick=(ids:number[])=>{
    if(!ids.length)return null;let n=roll()*ids.reduce((n,id)=>n+SHAPES[id]!.weight,0);
    for(const id of ids){n-=SHAPES[id]!.weight;if(n<0)return id;}return ids.at(-1)!;
  };
  const shuffle=()=>[0,1,2].map(i=>({i,r:roll()})).sort((a,b)=>a.r-b.r).map(x=>x.i);
  const first=legalOperations(rows,meter),available=[...new Set(first.ops.map(x=>x.shape))];
  const large=available.filter(id=>SHAPES[id]!.cells.length>=6);
  let requested:DirectorKind=rhythm.recoveryDeals?'recovery':saved.rest?'rest':moves<12||((rhythm.cycleMoves??moves)<6)?'build':
    count>=40||rhythm.dryMoves>=6?'relief':saved.sinceLoad>=3&&large.length?'load':count>=12&&saved.last!=='order'?'order':'build';
  let actual:DirectorKind=requested,path:Operation[]|null=null,rawIds:number[]|null=null,source='weighted-proven',orderBound:number|null=null;
  const signature=(ids:number[])=>ids.map(i=>SHAPES[i]!.family).sort().join(',');
  function mixed(maxArea:number){
    const pool=available.filter(id=>SHAPES[id]!.cells.length<=maxArea);if(!pool.length)return null;
    const old=meter.ceiling;meter.ceiling=Math.min(old,meter.used+4000);
    let backup:Operation[]|null=null;
    for(let attempt=0;attempt<4;attempt++){
      const ids=[pick(pool)!,pick(pool)!,pick(pool)!];
      if(new Set(ids.map(i=>SHAPES[i]!.family)).size<2&&pool.length>1&&attempt<3)continue;
      const result=proveIds(rows,ids,meter);if(result.path){backup??=result.path;if(!(rhythm.recentBags??[]).includes(signature(ids)))break;}
      if(result.status==='unknown')break;
    }
    meter.ceiling=old;return backup;
  }
  if(requested==='load'&&first.complete){
    const small=available.filter(id=>SHAPES[id]!.cells.length<=4);
    const a=pick(large),b=pick(small),c=pick(saved.deals>=8?large:available);
    if(a!==null&&b!==null&&c!==null){
      const ids=[a,b,c];
      if(options.guardLoad){const result=proveIds(rows,ids,meter);path=result.path;if(path)rawIds=ids;source=path?'load-proven':'load-unproven';}
      else {rawIds=ids;source='load-risk-individually-fitting';}
    }
  }
  if(!rawIds&&!path){
    const base=mixed(requested==='rest'?4:moves<9?5:6);
    path=base;
    if(requested==='order'&&first.complete){
      const initialKinds=new Set(available),old=meter.ceiling;
      meter.ceiling=Math.min(old,meter.used+12000);
      const potential=(r:number[])=>r.reduce((n,x)=>n+POP[x]!**2,0)+Array.from({length:8},(_,x)=>r.filter(row=>row&(1<<x)).length**2).reduce((a,b)=>a+b,0);
      const starts=first.ops.map(op=>({op,t:transition(rows,op,meter),r:roll()})).filter(x=>x.t);
      outer:for(const kind of ['clear','prepare'] as const){
        const phaseEnd=kind==='clear'?Math.min(meter.ceiling,meter.used+5000):meter.ceiling;
        const ceiling=meter.ceiling;meter.ceiling=phaseEnd;
        const selected=starts.filter(a=>kind==='clear'?a.t!.lines>0:a.t!.lines===0)
          .sort((a,b)=>(kind==='clear'?b.t!.lines-a.t!.lines:potential(b.t!.rows)-potential(a.t!.rows))||a.r-b.r).slice(0,6);
        for(const a of selected){
          const afterA=legalOperations(a.t!.rows,meter);if(!afterA.complete)break;
          const kindsA=new Set(afterA.ops.map(o=>o.shape));
          const seconds=afterA.ops.filter(o=>kind==='clear'?!initialKinds.has(o.shape):true)
            .map(op=>({op,t:transition(a.t!.rows,op,meter),r:roll()})).filter(b=>b.t&&(kind==='clear'||b.t.lines>0))
            .sort((a,b)=>b.t!.lines-a.t!.lines||a.r-b.r).slice(0,8);
          for(const b of seconds){
            const third=legalOperations(b.t!.rows,meter);if(!third.complete)break;
            const possible=third.ops.filter(o=>!initialKinds.has(o.shape)).sort((a,b)=>Number(kindsA.has(a.shape))-Number(kindsA.has(b.shape))||SHAPES[b.shape]!.cells.length-SHAPES[a.shape]!.cells.length);
            const c=possible.find(c=>SHAPES[c.shape]!.family!==SHAPES[b.op.shape]!.family)??possible[0];
            if(c){const final=transition(b.t!.rows,c,meter);if(!final)break;
              path=[a.op,b.op,c];orderBound=kind==='clear'?2:4;source=kind==='clear'?'clear-to-unlock':'prepare-clear-unlock';
              meter.ceiling=ceiling;break outer;}
          }
        }
        meter.ceiling=ceiling;
      }
      meter.ceiling=old;
      if(orderBound===null){actual='build';source='order-unavailable-weighted';}
    }
    if((requested==='relief'||requested==='recovery')&&base){
      let best=base,bestValue=-Infinity;
      const score=pathReward(rows,base,meter);if(score)bestValue=score.lines*100-score.occupied;
      let beam=[{rows,path:[] as Operation[],lines:0,value:0}];
      for(let depth=0;depth<3;depth++){
        const children:typeof beam=[];
        for(const node of beam){
          const legal=legalOperations(node.rows,meter);if(!legal.complete)break;
          for(const op of legal.ops){
            const next=transition(node.rows,op,meter);if(!next)break;
            const route=[...node.path,op],lines=node.lines+next.lines,value=lines*100-occupied(next.rows);
            if(depth===2&&value>bestValue){best=route;bestValue=value;}
            children.push({rows:next.rows,path:route,lines,value});
          }
        }
        if(!children.length)break;children.sort((a,b)=>b.value-a.value);beam=children.slice(0,4);
      }
      path=best;source='line-relief';
    }
    if(requested==='load'&&!rawIds){actual='build';source='load-unavailable-weighted';}
  }
  if(!rawIds&&!path){
    meter.ceiling=meter.limit;let current=rows;path=[];
    const single=SHAPES.findIndex(s=>s.id==='S1-0');
    for(let slot=0;slot<3;slot++){
      let selected:Operation|null=null;
      for(const op of catalog()[single]!){const fits=canPlace(current,op,meter);if(fits){selected=op;break;}if(fits===null)break;}
      if(!selected)throw Error('Director emergency budget or board invariant');
      const next=transition(current,selected,meter);if(!next)throw Error('Director emergency budget');
      current=next.rows;path.push(selected);
    }
    actual='emergency';source='bounded-singletons';
  }
  const permutation=shuffle();
  const packaged=rawIds?{tray:permutation.map(i=>({shapeId:SHAPES[rawIds![i]!]!.id,color:(rawIds![i]!%6)+1,used:false})),witness:null as import('./rules').Move[]|null}:packagePath(path!,permutation);
  if(rawIds&&path){const used=new Set<number>();packaged.witness=path.map(op=>{const i=rawIds!.findIndex((id,i)=>id===op.shape&&!used.has(i));used.add(i);return {slot:permutation.indexOf(i),x:op.x,y:op.y};});}
  const director:OrderDirectorState={version:1,deals:Math.min(1000000,saved.deals+1),sinceLoad:actual==='load'?0:Math.min(32,saved.sinceLoad+1),rest:requested==='rest'?0:saved.rest,last:actual};
  return {...packaged,rngState:rng,fallback:actual==='emergency',director,
    diagnostic:{requested,actual,source,checks:meter.used,limit:meter.limit,orderBound,large:packaged.tray.filter(s=>SHAPES.find(x=>x.id===s.shapeId)!.cells.length>=6).length}};
}
