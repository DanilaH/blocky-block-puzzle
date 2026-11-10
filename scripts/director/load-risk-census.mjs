import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {orderLoadRuntime} from './order-load-runtime.mjs';

// Offline audit. A separate exhaustive solver stops on its first complete route.
// Budget exhaustion remains unknown. Never feeds a classification back to selection.
const {server,R,P,A}=await orderLoadRuntime();
const catalog=new Map(R.SHAPES.map(s=>[s.id,Array.from({length:9-s.height},(_,y)=>Array.from({length:9-s.width},(_,x)=>({x,y,masks:Array.from({length:8},(_,row)=>s.cells.reduce((n,[dx,dy])=>row===y+dy?n|(1<<(x+dx)):n,0))}))).flat()]));
function classify(board,tray,budget=100000){
  let checks=0,exhausted=false;const failed=new Set();
  function visit(rows,used,path){
    if(used===7)return path;
    const key=used+':'+rows.join(',');if(failed.has(key))return null;
    for(let slot=0;slot<3;slot++)if(!(used&(1<<slot)))for(const op of catalog.get(tray[slot].shapeId)){
      if(checks>=budget){exhausted=true;return null;}checks++;
      if(op.masks.some((r,y)=>r&rows[y]))continue;
      const added=rows.map((r,y)=>r|op.masks[y]);let cols=255;for(const r of added)cols&=r;
      const next=added.map(r=>(r===255?0:r)&~cols);
      const found=visit(next,used|(1<<slot),[...path,{slot,x:op.x,y:op.y}]);
      if(found)return found;if(exhausted)return null;
    }
    failed.add(key);return null;
  }
  const witness=visit(A.toRows(board),0,[]);
  if(witness){let b=board;for(const m of witness){const s=R.shapeById(tray[m.slot].shapeId);assert(R.fits(b,s,m.x,m.y));b=R.place(b,s,m.x,m.y).board;}}
  return {status:witness?'solvable':exhausted?'unknown':'unsolvable',checks,budget,witness};
}
const first=[],missed=[];
try{
  // Fixed three-step player, first scheduled load only, max90 accepted moves.
  // The cohort/selection rule is recorded before inspecting its outcomes.
  for(let seed=851001;seed<=851256;seed++){
    let g=R.newGame(seed,'load-census-'+seed,'director-v1'),found=false;
    while(g.status==='playing'&&g.moves<=90){
      if(g.tray.every(s=>!s.used)&&g.director.last==='load'){
        for(const s of g.tray)assert(R.placements(g.board,R.shapeById(s.shapeId)).length);
        first.push({seed,move:g.moves,board:A.toRows(g.board),tray:g.tray,...classify(g.board,g.tray)});found=true;break;
      }
      const move=P.choose(g.board,g.tray,'three');assert(move);g=R.applyMove(g,move,g.revision).state;
    }
    if(!found)missed.push({seed,moves:g.moves,status:g.status});
    if((seed-851000)%32===0)console.log(JSON.stringify({firstCompleted:seed-851000}));
  }
  const pilotBytes=await fs.readFile('docs/qa/director-order-load/results.json.gz');
  const pilot=JSON.parse(gunzipSync(pilotBytes));
  const observed=pilot.loadCases.map(c=>({...c,...classify(A.toBoard(c.board),c.tray)}));
  const counts=rs=>Object.fromEntries(['solvable','unsolvable','unknown'].map(k=>[k,rs.filter(r=>r.status===k).length]));
  const result={schema:'blocky-load-risk-census-v1',selection:'256 seeds851001–851256; three-step player; first scheduled load by move90; no resampling',
    pilotSha256:createHash('sha256').update(pilotBytes).digest('hex'),first,missed,observed,
    firstCounts:counts(first),observedCounts:counts(observed),
    observedByStyle:Object.fromEntries(['clear','three','plausible'].map(style=>[style,counts(observed.filter(r=>r.style===style))])),
    note:'Individually fitting is not a joint-solvability guarantee. Unknown is not unsolvable. Pilot load events are correlated within trajectories.'};
  await fs.writeFile('docs/qa/director-order-load/load-risk.json.gz',gzipSync(JSON.stringify(result)+'\n'));
  console.log(JSON.stringify({first:result.firstCounts,missed,observed:result.observedCounts,byStyle:result.observedByStyle}));
}finally{await server.close();}
