// Diagnose the actual last trio; no policy or player changes.
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {mixedRuntime} from './mixed-runtime.mjs';
const {server,R,A}=await mixedRuntime(),data=JSON.parse(gunzipSync(await fs.readFile('docs/qa/director-mixed/results.json.gz')));
const counts={ended:0,firstAlreadyLost:0,secondLost:0,unknown:0,certifiedFirstThenLost:0},phases={},examples=[],seen=new Set();
try{
 for(const run of data.runs){
  if(run.mode!=='candidate'||!run.ended)continue;counts.ended++;
  const d=run.deals.at(-1),moves=run.actions.slice(d.move).map(([slot,x,y])=>({slot,x,y})),board=A.toBoard(d.board),tray=structuredClone(d.tray);
  assert(moves.length===1||moves.length===2);
  const first=moves[0],s=R.shapeById(tray[first.slot].shapeId);assert(R.fits(board,s,first.x,first.y));
  const afterFirst=R.place(board,s,first.x,first.y).board;tray[first.slot].used=true;
  const a=A.analyze(afterFirst,tray,100000);let kind;
  if(a.witness){
   kind='secondLost';counts.secondLost++;assert.equal(moves.length,2);
   let b=afterFirst,used=new Set([first.slot]);
   for(const m of a.witness){assert(!used.has(m.slot));used.add(m.slot);const shape=R.shapeById(tray[m.slot].shapeId);assert(R.fits(b,shape,m.x,m.y));b=R.place(b,shape,m.x,m.y).board;}assert.equal(used.size,3);
  }else if(a.complete){kind='firstAlreadyLost';counts.firstAlreadyLost++;}else{kind='unknown';counts.unknown++;}
  const certified=d.diagnostic.robustness.roots.some(p=>p.status==='found'&&JSON.stringify(p.move)===JSON.stringify(first));
  if(certified){assert(a.witness);counts.certifiedFirstThenLost++;}
  let end=board;const used=new Set();for(const m of moves){const shape=R.shapeById(d.tray[m.slot].shapeId);assert(R.fits(end,shape,m.x,m.y));end=R.place(end,shape,m.x,m.y).board;used.add(m.slot);}
  assert(d.tray.every((s,i)=>used.has(i)||R.placements(end,R.shapeById(s.shapeId)).length===0));
  const phase=d.diagnostic.actual;phases[phase]??={ended:0,secondLost:0,certifiedFirstThenLost:0};phases[phase].ended++;phases[phase].secondLost+=Number(kind==='secondLost');phases[phase].certifiedFirstThenLost+=Number(certified);
  const key=run.split+':'+run.style;
  if(!seen.has(key)){seen.add(key);examples.push({split:run.split,seed:run.seed,style:run.style,phase,atMove:d.move,board:d.board,tray:d.tray,actual:moves,kind,certifiedFirst:certified,alternativeTail:a.witness,complete:a.complete,checks:a.checks});}
 }
 const result={counts,phases,examples};await fs.writeFile('docs/qa/director-mixed/failures.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({counts,phases,examples:examples.length}));
}finally{await server.close();}
