import fs from 'node:fs/promises';
import {mixedRuntime} from './mixed-runtime.mjs';
const {server,R}=await mixedRuntime();
try{
 const G=await server.ssrLoadModule('/src/core/director-goal-tools.ts');
 const S=await server.ssrLoadModule('/src/core/director-search.ts');
 const input=JSON.parse(await fs.readFile('docs/qa/director-constructive/diagnostic-input.json','utf8'));
 const rank=R.SHAPES.map((_,i)=>i),out=[];
 function sequential(rows,meter,left=3){
  const all=[];
  for(const ops of S.catalog())for(const op of ops){
   const fits=S.canPlace(rows,op,meter);if(fits===null)return null;if(!fits)continue;
   const n=S.transition(rows,op,meter);if(!n)return null;
   if(n.clear)return [op];
   if(left>1&&n.lines&&S.occupied(n.rows)<S.occupied(rows))all.push({op,rows:n.rows,occupied:S.occupied(n.rows)});
  }
  const seen=new Set();
  for(const n of all.sort((a,b)=>a.occupied-b.occupied)){
   const key=n.rows.join();if(seen.has(key))continue;seen.add(key);
   const path=sequential(n.rows,meter,left-1);if(path)return[n.op,...path];
   if(meter.used>=meter.ceiling)break;
  }
  return null;
 }
 for(const e of input){
  const results={};
  for(const [name,search] of [
   ['compact550',(r,m)=>G.compactReward(r,m,rank)],
   ['compactFull',(r,m)=>G.compactReward(r,m,rank)],
   ['mixedEnvelope3',(r,m)=>G.shortReward(r,m,rank)],
   ['mixedEnvelope6',(r,m)=>G.shortReward(r,m,rank,6)],
   ['sequential3',sequential],
  ]){
   const meter=new S.WorkBudget();
   if(name==='compact550')meter.ceiling=550;
   const path=search(e.rows,meter);
   if(path){let b=e.rows.flatMap(r=>Array.from({length:8},(_,x)=>Number(!!(r&(1<<x)))));for(const o of path){if(!R.fits(b,R.SHAPES[o.shape],o.x,o.y))throw Error('Illegal diagnostic route');b=R.place(b,R.SHAPES[o.shape],o.x,o.y).board;}if(b.some(Boolean))throw Error('False diagnostic reward');}
   results[name]={found:!!path,work:meter.used,route:path?.map(({shape,x,y})=>({shape,x,y}))??null};
  }
  out.push({...e,results});
 }
 await fs.writeFile('docs/qa/director-constructive/diagnosis.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({samples:out.length,searches:Object.fromEntries(Object.keys(out[0].results).map(k=>[k,out.filter(e=>e.results[k].found).length])),newSequential:out.filter(e=>e.results.sequential3.found&&!e.results.compactFull.found).map(e=>({seed:e.seed,move:e.move,rows:e.rows,route:e.results.sequential3.route}))}));
}finally{await server.close()}
