import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { runtime, hash } from './architecture/runtime.mjs';
const root='docs/qa/dealer-architecture';
const raw=await fs.readFile(`${root}/composition.json.gz`),data=JSON.parse(gunzipSync(raw));
const originalRaw=await fs.readFile(`${root}/snapshots.json.gz`),original=JSON.parse(gunzipSync(originalRaw));
assert.equal(data.primarySnapshotsSha256,hash(originalRaw));
assert.equal(data.protocolSha256,hash(await fs.readFile(`${root}/composition-protocol.md`)));
const checks={assignments:0,positiveProofs:0,negativeProofs:0,actions:0,permutations:0,dataSha256:hash(raw)};
for(const catalogue of ['full','common']){
 const rt=await runtime(catalogue),{R,A}=rt;
 const cache=new Map();
 function canFinish(rows,tray){
  if(tray.every(s=>s.used))return true;
  const key=rows.join(',')+':'+tray.map(s=>s.used?'x':s.shapeId).join(',');
  if(cache.has(key))return cache.get(key);
  for(const op of A.actions(rows,tray))if(canFinish(A.transition(rows,op).rows,tray.map((s,i)=>({...s,used:s.used||i===op.slot})))){cache.set(key,true);return true;}
  cache.set(key,false);return false;
 }
 try{
  for(const policy of ['flow-v4','director-v2','random-proved'])for(const shift of [1,17,31]){
   const rows=data.rows.filter(r=>r.catalogue===catalogue&&r.policy===policy&&r.shift===shift);
   const before=original.results.filter(r=>r.catalogue===catalogue&&r.policy===policy).map(r=>JSON.stringify(r.tray)).sort();
   assert.deepEqual(rows.map(r=>JSON.stringify(r.tray)).sort(),before);checks.permutations++;
  }
  for(const row of data.rows.filter(r=>r.catalogue===catalogue)){
   const board=A.toBoard(row.board);
   if(row.proof.witness){rt.verify(board,{tray:row.tray,witness:row.proof.witness});checks.positiveProofs++;}
   if(row.proof.status==='impossible'){cache.clear();assert(!canFinish(row.board,row.tray));checks.negativeProofs++;}
   for(const play of row.plays){let b=board,t=structuredClone(row.tray),lines=0,earned=false;
    for(const m of play.actions){assert(!t[m.slot].used);const s=R.shapeById(t[m.slot].shapeId);assert(R.fits(b,s,m.x,m.y));
     const op=A.actions(A.toRows(b),t).find(o=>o.slot===m.slot&&o.x===m.x&&o.y===m.y);assert(op);
     const masked=A.transition(A.toRows(b),op),p=R.place(b,s,m.x,m.y);assert.deepEqual(A.toRows(p.board),masked.rows);assert.equal(p.lines,masked.lines);
     b=p.board;t[m.slot].used=true;lines+=p.lines;earned ||= b.every(c=>!c);checks.actions++;
    }
    assert.deepEqual(A.toRows(b),play.endpoint);assert.equal(lines,play.lines);assert.equal(earned,play.earned);assert.equal(t.every(s=>s.used),play.completed);
   }
   checks.assignments++;
  }
 }finally{await rt.server.close()}
}
checks.verifierSha256=hash(await fs.readFile('scripts/director/verify-architecture-composition.mjs'));
await fs.writeFile(`${root}/composition-checks.json`,JSON.stringify(checks,null,2)+'\n');
console.log(JSON.stringify(checks));
