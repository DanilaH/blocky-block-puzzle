// Additional bounded search-class probe on the same ENGINEERING cases.
// This does not change C1 or provide candidate acceptance evidence.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { localRuntime } from './local-choice/run.mjs';
import { hash } from './architecture/runtime.mjs';
const inputRaw=await fs.readFile('docs/qa/local-choice/search-diagnosis.json'),input=JSON.parse(inputRaw);
const rt=await localRuntime(),{R,A}=rt;
const S=await rt.server.ssrLoadModule('/src/core/director-search.ts'),G=await rt.server.ssrLoadModule('/src/core/director-goal-tools.ts');
const cases=[];
try{
 for(const original of input.cases){let rng=(original.seed+original.move)>>>0;
  const rank=R.SHAPES.map((_,i)=>{const r=R.random(rng);rng=r.state;return{i,r:r.value}}).sort((a,b)=>a.r-b.r).map(x=>x.i);
  const meter=new S.WorkBudget();meter.ceiling=meter.limit;
  const nodes=G.directorBeam({rows:original.board,meter,rank,reverse:false,width:8,work:24000,allow:()=>true,
   score:n=>n.clears*100000-S.occupied(n.rows)*100+n.lines*50});
  const result=nodes.find(n=>n.clears>0);let packaged=null;
  if(result){packaged=S.packagePath(result.path,[0,1,2]);rt.verify(A.toBoard(original.board),packaged);let b=A.toBoard(original.board),earned=false;
   for(const m of packaged.witness){b=R.place(b,R.shapeById(packaged.tray[m.slot].shapeId),m.x,m.y).board;earned ||= b.every(c=>!c)}assert(earned);
  }
  cases.push({seed:original.seed,move:original.move,board:original.board,minCover:original.cover,status:result?'found':'unknown',checks:meter.used,...(packaged??{})});
 }
 const out={schema:'blocky-local-dynamic-postmortem-v1',inputSha256:hash(inputRaw),scriptSha256:hash(await fs.readFile('scripts/director/local-choice-dynamic-diagnose.mjs')),
  note:'One width8 bounded current-tray beam allowing intermediate clears; no future preparation. A miss is unknown. Diagnostic on engineering only; not a new gameplay candidate.',cases};
 await fs.writeFile('docs/qa/local-choice/dynamic-diagnosis.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({cases:cases.length,found:cases.filter(x=>x.status==='found').length}));
}finally{await rt.server.close()}
