import {SHAPES,random,type Board} from './rules';
import {initialRhythmV4,type RhythmState} from './rhythm';
import {WorkBudget,toRows,occupied,legalOperations,proveIds,catalog,canPlace,transition,packagePath,type Operation} from './director-search';
import {boardGeometry,finishGoal,directorBeam,type DirectorNode} from './director-goal-tools';
import {assessTrio,remapRobustness,type Robustness} from './director-robustness';

export type MixedKind='gentle'|'build'|'friendly'|'gift'|'relief'|'load'|'rest'|'recovery'|'emergency';
export interface MixedDirectorState {version:3;deals:number;sinceLoad:number;nextLoad:number;rest:number;giftDeals:number;last:MixedKind;}
export const initialMixedDirector=():MixedDirectorState=>({version:3,deals:0,sinceLoad:0,nextLoad:4,rest:0,giftDeals:0,last:'gentle'});
export function validMixedDirector(s:MixedDirectorState|undefined){
  return !!s&&s.version===3&&Number.isInteger(s.deals)&&s.deals>=0&&s.deals<=1000000&&
    Number.isInteger(s.sinceLoad)&&s.sinceLoad>=0&&s.sinceLoad<=32&&Number.isInteger(s.nextLoad)&&s.nextLoad>=3&&s.nextLoad<=5&&
    Number.isInteger(s.rest)&&s.rest>=0&&s.rest<=1&&Number.isInteger(s.giftDeals)&&s.giftDeals>=0&&s.giftDeals<=1&&['gentle','build','friendly','gift','relief','load','rest','recovery','emergency'].includes(s.last);
}
export const observeMixedDirector=(s:MixedDirectorState,allClear:boolean):MixedDirectorState=>allClear?{...s,rest:1,giftDeals:0}:s;

export function mixedDirectorDeal(board:Board,seed:number,moves=0,rhythm:RhythmState=initialRhythmV4(),saved=initialMixedDirector(),budget=24000){
  const meter=new WorkBudget(budget),rows=toRows(board),count=occupied(rows),normal=meter.ceiling;
  let rng=seed>>>0||1;const roll=()=>{const r=random(rng);rng=r.state;return r.value;};
  const phaseRoll=roll(),variation=roll();
  const rank=SHAPES.map((_,i)=>({i,r:roll()})).sort((a,b)=>a.r-b.r).map(x=>x.i),reverse=roll()>.5;
  const initial=legalOperations(rows,meter),available=[...new Set(initial.ops.map(o=>o.shape))];
  const cycle=rhythm.cycleMoves??moves,firstGift=moves>=6&&moves<=24&&cycle===moves;
  const danger=count>=28||rhythm.dryMoves>=4&&count>=18;
  const large=available.some(i=>SHAPES[i]!.cells.length>=6);
  const requested:MixedKind=rhythm.recoveryDeals?'recovery':saved.rest?'rest':saved.giftDeals?'gift':
    firstGift&&phaseRoll<.55?'gift':moves<12?'gentle':count>0&&cycle>=12&&phaseRoll<.30?'gift':danger?'relief':saved.last==='load'?'relief':
    saved.sinceLoad>=saved.nextLoad&&large&&count<=24&&moves>=18&&cycle>=6?'load':
    variation<.22?'friendly':'build';
  const secondLarge=requested==='load'&&moves>=48&&count<=24&&variation<.35;
  const support=requested==='relief'||requested==='recovery'||requested==='gift';
  const maxSize=requested==='rest'||requested==='friendly'?4:moves<12?6:9;
  const required=moves<18||support||requested==='rest'?3:2;
  const bag=(p:Operation[])=>p.map(o=>SHAPES[o.shape]!.family).sort().join(',');
  const score=(node:DirectorNode,depth:number)=>{
    const g=boardGeometry(node.rows),fresh=depth===2?((rhythm.recentBags??[]).includes(bag(node.path))?-80:45):0;
    const variety=depth===2&&new Set(node.path.map(o=>SHAPES[o.shape]!.family)).size>=2?40:0;
    if(requested==='load')return g.occupied*3-node.lines*8-g.holes*25-g.edges+fresh+variety;
    const desired=requested==='gift'?0:support?Math.max(0,count-16):16;
    // Relief removes a bottleneck. It does not automatically target a new
    // all-clear, including on the rest tray after an earned all-clear.
    return node.clears*(requested==='gift'?5000:requested==='gentle'?1000:0)+node.lines*(support?500:180)+
      g.fullness*1.1-g.holes*65-g.edges*2-Math.abs(g.occupied-desired)*2+fresh+variety;
  };
  type Candidate={path:Operation[];value:number;goal:boolean;source:string};
  const candidates:Candidate[]=[];
  if(requested==='gift'&&count){
    const end=Math.min(normal,meter.used+6000),searchEnd=Math.max(meter.used,end-256);
    meter.ceiling=searchEnd;
    let prefix:Operation[]|null=null,after=rows;
    for(const op of initial.ops){const next=transition(rows,op,meter);if(!next)break;if(next.clear){prefix=[op];after=next.rows;break;}}
    if(!prefix){
      const exact=finishGoal(rows,meter,rank);if(exact)candidates.push({path:exact,value:100000,goal:true,source:'three-piece-reward'});
    }
    if(!prefix&&!candidates.some(c=>c.goal)){
      const gifts=directorBeam({rows,meter,rank,reverse,depths:2,width:4,work:Math.max(0,searchEnd-meter.used),allow:id=>SHAPES[id]!.cells.length<=(moves<18?4:6),
        score:node=>{const g=boardGeometry(node.rows);return node.clears*10000+node.lines*150+g.fullness*.6-g.holes*50-g.edges*2-g.occupied*2;}});
      const earned=gifts.find(g=>g.clears>0);if(earned){prefix=earned.path;after=earned.rows;}
    }
    meter.ceiling=end;
    if(prefix){
      const path=[...prefix],small=rank.filter(i=>SHAPES[i]!.cells.length>=2&&SHAPES[i]!.cells.length<=4);
      for(let i=path.length;i<3;i++){
        const piece=small[(i-prefix.length)%small.length]!,p=proveIds(after,[piece],meter);
        if(!p.path)break;path.push(p.path[0]!);const next=transition(after,p.path[0]!,meter);if(!next)break;after=next.rows;
      }
      if(path.length===3)candidates.push({path,value:100000,goal:true,source:'short-reward-opportunity'});
    }
    meter.ceiling=normal;
  }
  function weighted(){
    const pool=available.filter(i=>SHAPES[i]!.cells.length<=maxSize&&SHAPES[i]!.cells.length>=(support?1:2));
    if(!pool.length)return;
    const pick=()=>{let n=roll()*pool.reduce((s,id)=>s+SHAPES[id]!.weight,0);for(const id of pool){n-=SHAPES[id]!.weight;if(n<0)return id;}return pool.at(-1)!;};
    const cap=meter.ceiling;meter.ceiling=Math.min(cap,meter.used+1600);
    for(let n=0;n<3;n++){
      const ids=[pick(),pick(),pick()];if(new Set(ids.map(i=>SHAPES[i]!.family)).size<2&&n<2)continue;
      const p=proveIds(rows,ids,meter);if(p.path){
        let b=rows,lines=0,clears=0;for(const op of p.path){const next=transition(b,op,meter);if(!next)break;b=next.rows;lines+=next.lines;clears+=Number(next.clear);}
        const node={rows:b,path:p.path,lines,clears,value:0};candidates.push({path:p.path,value:score(node,2),goal:false,source:'weighted-flexible'});
      }
      if(p.status==='unknown')break;
    }
    meter.ceiling=cap;
  }
  if(requested!=='load')weighted();
  if(requested!=='rest'&&requested!=='friendly'){
    const frontier=directorBeam({rows,meter,rank,reverse,width:6,work:9000,
      allow:(id,depth)=>{const n=SHAPES[id]!.cells.length;return requested==='load'?(depth===0||depth===2&&secondLarge?n>=6:n>=2&&n<=4):n<=maxSize;},
      score,key:node=>node.rows.join(',')+':'+bag(node.path)});
    const known=new Set(candidates.map(c=>bag(c.path)));
    for(const node of frontier){const key=bag(node.path);if(known.has(key))continue;known.add(key);const goal=requested==='gift'&&node.clears>0;candidates.push({path:node.path,value:node.value+(goal?100000:0),goal,source:goal?'prepared-reward':'line-and-space'});if(known.size>=8)break;}
  }
  candidates.sort((a,b)=>b.value-a.value);
  const safe:{candidate:Candidate;assessment:Robustness}[]=[];
  let best:{candidate:Candidate;assessment:Robustness}|null=null,rejected=0;
  const assessmentEnd=Math.min(normal,meter.used+7500);
  for(const c of candidates.slice(0,6)){
    const cap=meter.ceiling;meter.ceiling=Math.min(assessmentEnd,meter.used+(c.goal?4000:1800));
    const assessment=assessTrio(rows,c.path,meter,required,c.goal);meter.ceiling=cap;
    if(!best||assessment.safe>best.assessment.safe)best={candidate:c,assessment};
    if(assessment.adequate)safe.push({candidate:c,assessment});else rejected++;
    if(safe.length>=3||meter.used>=assessmentEnd)break;
  }
  const gift=safe.find(s=>s.candidate.goal),near=safe.filter(s=>s.candidate.value>=(safe[0]?.candidate.value??0)-80);
  let chosen=gift??(near.length?near[Math.floor(roll()*Math.min(3,near.length))]!:best);
  let actual:MixedKind=requested;
  if(!chosen){
    meter.ceiling=meter.limit;const id=SHAPES.findIndex(s=>s.id==='S1-0'),path:Operation[]=[];let b=rows;
    for(let i=0;i<3;i++){
      let found:Operation|undefined;
      for(const op of catalog()[id]!){const fits=canPlace(b,op,meter);if(fits){found=op;break;}if(fits===null)break;}
      if(!found)throw Error('Mixed emergency invariant');const next=transition(b,found,meter);if(!next)throw Error('Mixed emergency budget');b=next.rows;path.push(found);
    }
    chosen={candidate:{path,value:0,goal:false,source:'bounded-singletons'},assessment:{adequate:false,required,safe:0,unknown:0,rewardSafe:0,roots:[]}};actual='emergency';
  }
  if(requested==='gift'&&!chosen.candidate.goal)actual='relief';
  const permutation=[0,1,2].map(i=>({i,r:roll()})).sort((a,b)=>a.r-b.r).map(x=>x.i),packaged=packagePath(chosen.candidate.path,permutation);
  const director:MixedDirectorState={version:3,deals:Math.min(1000000,saved.deals+1),sinceLoad:actual==='load'?0:Math.min(32,saved.sinceLoad+1),
    nextLoad:actual==='load'?3+Math.floor(roll()*3):saved.nextLoad,rest:requested==='rest'?0:saved.rest,
    giftDeals:requested==='gift'?(saved.giftDeals?0:1):saved.giftDeals,last:actual};
  return {...packaged,rngState:rng,fallback:actual==='emergency',director,
    diagnostic:{requested,actual,source:chosen.candidate.source,checks:meter.used,limit:meter.limit,goalAttempted:requested==='gift',goalConstructed:candidates.some(c=>c.goal),goalFound:chosen.candidate.goal,secondLarge,rejected,
      certifiedChoices:safe.length,robustness:remapRobustness(chosen.assessment,permutation),large:packaged.tray.filter(s=>SHAPES.find(x=>x.id===s.shapeId)!.cells.length>=6).length}};
}
