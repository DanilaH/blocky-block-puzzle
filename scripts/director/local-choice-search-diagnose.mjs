// Postmortem on ENGINEERING positions only; not a changed dealer or acceptance.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { localRuntime } from './local-choice/run.mjs';
import { hash } from './architecture/runtime.mjs';
const raw=await fs.readFile('docs/qa/local-choice/engineering.json.gz'),data=JSON.parse(gunzipSync(raw));
const rt=await localRuntime(),{R,A}=rt;
const S=await rt.server.ssrLoadModule('/src/core/director-search.ts');
const G=await rt.server.ssrLoadModule('/src/core/director-goal-tools.ts');
const pop=n=>{let c=0;for(;n;n&=n-1)c++;return c;};
function minCover(rows){let best={lines:16,rowMask:0,colMask:0};
 for(let rowMask=0;rowMask<256;rowMask++){let colMask=0;for(let y=0;y<8;y++)if(!(rowMask&1<<y))colMask|=rows[y];
  const lines=pop(rowMask)+pop(colMask);if(lines<best.lines)best={lines,rowMask,colMask};
 }
 assert(rows.every((r,y)=>(best.rowMask&1<<y)||!(r&~best.colMask)));return best;
}
const byCell=Array.from({length:64},()=>[]);
for(const ops of S.catalog())for(const op of ops)for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(op.rows[y]&1<<x)byCell[y*8+x].push(op);
function expanded(rows){const meter=new S.WorkBudget(),targets=[],count=S.occupied(rows);meter.ceiling=meter.limit;
 for(let rowMask=0;rowMask<256;rowMask++){
  let required=0;for(let y=0;y<8;y++)if(!(rowMask&1<<y))required|=rows[y];
  for(let colMask=required;colMask<256;colMask++){if((colMask&required)!==required)continue;
   const target=Array.from({length:8},(_,y)=>rowMask&1<<y?255:colMask),deficit=S.occupied(target)-count;
   if(deficit>=3&&deficit<=27)targets.push({target,deficit,lines:pop(rowMask)+pop(colMask)});
  }
 }
 targets.sort((a,b)=>a.deficit-b.deficit||a.lines-b.lines||a.target.join(',').localeCompare(b.target.join(',')));
 let answer=null,targetUsed=null,exhausted=false;
 const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
 function solve(missing,path){
  const left=S.occupied(missing),remaining=3-path.length;
  if(!left){if(remaining)return false;
   for(const order of orders){let b=rows;const route=[];
    for(const i of order){const op=path[i],fits=S.canPlace(b,op,meter);if(fits===null){exhausted=true;return false;}if(!fits)break;
     const n=S.transition(b,op,meter);if(!n){exhausted=true;return false;}b=n.rows;route.push(op);
    }
    if(route.length===3&&S.occupied(b)===0){answer=route;return true;}
   }
   return false;
  }
  if(!remaining||left<remaining||left>remaining*9)return false;
  const y=missing.findIndex(r=>r),x=31-Math.clz32(missing[y]&-missing[y]);
  for(const op of byCell[y*8+x]){if(!meter.spend()){exhausted=true;return false;}
   const size=R.SHAPES[op.shape].cells.length;
   if(size>left-(remaining-1)||left-size>(remaining-1)*9||op.rows.some((r,y)=>(r&missing[y])!==r))continue;
   if(solve(missing.map((r,y)=>r&~op.rows[y]),[...path,op]))return true;if(exhausted)return false;
  }
  return false;
 }
 for(const target of targets){if(!meter.spend()){exhausted=true;break;}
  if(solve(target.target.map((r,y)=>r&~rows[y]),[])){targetUsed=target;break;}if(exhausted)break;
 }
 return{path:answer,target:targetUsed,checks:meter.used,status:answer?'found':'unknown',enumeratedTargets:targets.length};
}
const positions=data.runs.filter(r=>r.policy==='local-choice'&&r.style==='bounded').flatMap(r=>r.deals.filter(d=>d.move>=12&&d.move<r.moves)
 .map(d=>({seed:r.seed,move:d.move,board:d.board,cover:minCover(d.board)})));
const selected=positions.filter(p=>p.cover.lines>4).sort((a,b)=>hash(a).localeCompare(hash(b))).slice(0,12),cases=[];
try{
 for(const p of selected){const meter=new S.WorkBudget(),native=G.finishGoal(p.board,meter,R.SHAPES.map((_,i)=>i));assert.equal(native,null);
  const result=expanded(p.board);let packaged=null;
  if(result.path){packaged=S.packagePath(result.path,[0,1,2]);rt.verify(A.toBoard(p.board),packaged);let b=A.toBoard(p.board);
   for(const m of packaged.witness)b=R.place(b,R.shapeById(packaged.tray[m.slot].shapeId),m.x,m.y).board;assert(b.every(c=>!c));
  }
  cases.push({...p,native:{status:'unknown',checks:meter.used,targetClassExcluded:true},expanded:{...result,path:undefined,...(packaged??{})}});
 }
 const out={schema:'blocky-local-search-postmortem-v1',engineeringSha256:hash(raw),scriptSha256:hash(await fs.readFile('scripts/director/local-choice-search-diagnose.mjs')),
  note:'Engineering diagnostic only. Min cover>4 excludes the old static target class, not every dynamic all-clear route. Expanded misses remain unknown. C1 and all holdout data are unchanged.',
  latePositions:positions.length,classExcluded:positions.filter(p=>p.cover.lines>4).length,cases};
 await fs.writeFile('docs/qa/local-choice/search-diagnosis.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({latePositions:out.latePositions,classExcluded:out.classExcluded,probes:cases.length,found:cases.filter(p=>p.expanded.status==='found').length}));
}finally{await rt.server.close()}
