import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Paired case bootstrap. Analysis randomness is separate from gameplay. */
export function pairedStats(values,label='',iterations=10000){
 assert(values.length>0&&values.every(Number.isFinite));assert(Number.isInteger(iterations)&&iterations>0);
 const n=values.length,mean=values.reduce((s,x)=>s+x,0)/n,ordered=[...values].sort((a,b)=>a-b);
 const median=n%2?ordered[(n-1)/2]:(ordered[n/2-1]+ordered[n/2])/2;
 let rng=0x98a12f;for(const c of label)rng=Math.imul(rng^c.charCodeAt(0),16777619)>>>0;if(!rng)rng=1;
 const samples=[];
 for(let i=0;i<iterations;i++){let sum=0;for(let k=0;k<n;k++){rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;rng>>>=0;sum+=values[Math.floor(rng/2**32*n)];}samples.push(sum/n);}
 samples.sort((a,b)=>a-b);
 return {n,mean,median,shorter:values.filter(x=>x<0).length,same:values.filter(x=>x===0).length,longer:values.filter(x=>x>0).length,caseBootstrap95:[samples[Math.floor((iterations-1)*.025)],samples[Math.floor((iterations-1)*.975)]],iterations};
}

export function analyze(data){
 assert.equal(data.games.length,512);assert.equal(data.reproduced,128);
 const games=data.games,styles=['clear','lapse'],keys=['geometry','counter','stream','tasks'];
 const cases=[...new Set(games.map(g=>g.caseId))].sort((a,b)=>a-b);assert.equal(cases.length,16);
 const index=new Map();for(const g of games){const k=[g.style,g.caseId,...keys.map(p=>g[p])].join('/');assert(!index.has(k));index.set(k,g);}
 const get=(style,id,levels)=>{const x=index.get([style,id,...keys.map(k=>levels[k])].join('/'));assert(x);return x;};
 const byCell={};
 for(const style of styles){
  byCell[style]={};for(let code=0;code<16;code++){
   const levels={geometry:(code>>3)&1,counter:(code>>2)&1,stream:(code>>1)&1,tasks:code&1},rows=cases.map(id=>get(style,id,levels));
   const moves=rows.reduce((n,x)=>n+x.moves,0),rewards=rows.reduce((n,x)=>n+x.allClears,0),ordinary=rows.reduce((n,x)=>n+x.ordinary,0);
   const key=keys.map(k=>`${k[0]}${levels[k]}`).join('_');
   byCell[style][key]={...levels,runs:rows.length,cappedMean:moves/rows.length,censored:rows.filter(x=>!x.ended).length,early:rows.filter(x=>x.ended&&x.moves<=36).length,allClears:rewards,rewardRate:rewards/moves,ordinaryRate:ordinary/moves,changedHands:rows.reduce((n,x)=>n+x.changedHands,0),maxWork:Math.max(...rows.map(x=>x.maxWork))};
  }
 }
 const paired=[];
 for(const style of styles)for(const factor of keys){
  const fixedKeys=keys.filter(k=>k!==factor);
  for(let code=0;code<8;code++){
   const fixed=Object.fromEntries(fixedKeys.map((k,i)=>[k,(code>>i)&1])),a=cases.map(id=>get(style,id,{...fixed,[factor]:0})),b=cases.map(id=>get(style,id,{...fixed,[factor]:1}));
   const label=`${style}/${factor}/${JSON.stringify(fixed)}`;
   let firstChangedHand=null;
   const firstChanges=[];
   for(let j=0;j<a.length;j++){
    const aa=a[j].events,bb=b[j].events;
    for(let k=0;k<Math.min(aa.length,bb.length);k++)if(JSON.stringify([...aa[k].ids].sort())!==JSON.stringify([...bb[k].ids].sort())||aa[k].occupied!==bb[k].occupied||aa[k].goal.last!==bb[k].goal.last){firstChanges.push(Math.min(aa[k].at,bb[k].at));break;}
   }
   if(firstChanges.length)firstChangedHand=pairedStats(firstChanges,label+'/first',1000).median;
   paired.push({style,factor,fixed,deltaCappedMoves:pairedStats(a.map((x,i)=>b[i].moves-x.moves),label),deltaAllClears:pairedStats(a.map((x,i)=>b[i].allClears-x.allClears),label+'/rewards'),traceDifferent:a.filter((x,i)=>x.trajectoryHash!==b[i].trajectoryHash).length,firstChangedHandMedian:firstChangedHand});
  }
 }
 const interactions=[];
 for(const style of styles){
  for(let counter=0;counter<2;counter++)for(let stream=0;stream<2;stream++){
   const effect=geometry=>cases.map(id=>get(style,id,{geometry,counter,stream,tasks:1}).moves-get(style,id,{geometry,counter,stream,tasks:0}).moves);
   const plain=effect(0),authored=effect(1),label=`interaction/${style}/${counter}/${stream}`;
   interactions.push({style,counter,stream,plainTaskEffect:pairedStats(plain,label+'/plain'),authoredTaskEffect:pairedStats(authored,label+'/authored'),differenceInEffects:pairedStats(plain.map((x,i)=>authored[i]-x),label+'/interaction')});
  }
 }
 const native=[];
 for(const style of styles){
  const rows=cases.map(id=>({control:get(style,id,{geometry:0,counter:1,stream:1,tasks:0}),tasks:get(style,id,{geometry:0,counter:1,stream:1,tasks:1}),starts:get(style,id,{geometry:1,counter:0,stream:0,tasks:0}),full:get(style,id,{geometry:1,counter:0,stream:0,tasks:1})}));
  native.push({style,fullMinusStarts:pairedStats(rows.map(r=>r.full.moves-r.starts.moves),style+'/native/full'),tasksMinusControl:pairedStats(rows.map(r=>r.tasks.moves-r.control.moves),style+'/native/tasks'),differenceInEffects:pairedStats(rows.map(r=>(r.full.moves-r.starts.moves)-(r.tasks.moves-r.control.moves)),style+'/native/interaction'),tailGuardExcess:pairedStats(rows.map(r=>r.full.moves-1.1*r.starts.moves),style+'/native/excess')});
 }
 return {provenance:'Synthetic only; seen diagnostic counterfactuals, not acceptance/people/phone',runs:512,nCases:16,nativeOutcomesExact:128,initial:{ordinarySinceLoad:1,authoredSinceLoad:0,payoffBoth:1,ordinaryRngDraws:[...new Set(data.initialChecks.map(x=>x.ordinaryRngDraws))],authoredRngDraws:[...new Set(data.initialChecks.map(x=>x.authoredRngDraws))]},byCell,paired,interactions,native,maxWork:Math.max(...games.map(g=>g.maxWork)),notes:['Capped at300; censored is not a loss','Case bootstrap is exploratory at16 preselected conditions, not a population significance test','Trace hash includes chosen slots; it is not a content diversity score','Certificates are not independent plausible content; no content acceptance evaluated','No production policy or owner save modified']};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2]??'artifacts/challenge-start-causality/diagnostic.json',data=JSON.parse(await fs.readFile(file,'utf8'));
 const summary=analyze(data);await fs.writeFile(file.replace(/\.json$/,'.summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({runs:summary.runs,initial:summary.initial,native:summary.native,interactions:summary.interactions.filter(x=>x.counter===1),counterPairs:summary.paired.filter(x=>x.factor==='counter').map(x=>({style:x.style,fixed:x.fixed,mean:x.deltaCappedMoves.mean,traceDifferent:x.traceDifferent}))},null,2));
}
