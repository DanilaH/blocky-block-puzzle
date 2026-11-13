import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {orderLoadRuntime} from './order-load-runtime.mjs';
const riskBytes=await fs.readFile('docs/qa/director-order-load/load-risk.json.gz'),risk=JSON.parse(gunzipSync(riskBytes));
const pilotBytes=await fs.readFile('docs/qa/director-order-load/results.json.gz'),pilot=JSON.parse(gunzipSync(pilotBytes));
assert.equal(risk.pilotSha256,createHash('sha256').update(pilotBytes).digest('hex'));
const {server,R,A}=await orderLoadRuntime();
let fatalVerified=0,loadWitnesses=0;
try{
 for(const c of [...risk.first,...risk.observed]){
  if(c.status==='solvable'){
    let board=A.toBoard(c.board);const used=new Set();
    for(const m of c.witness){assert(!used.has(m.slot));used.add(m.slot);const s=R.shapeById(c.tray[m.slot].shapeId);assert(R.fits(board,s,m.x,m.y));board=R.place(board,s,m.x,m.y).board;}
    assert.equal(used.size,3);loadWitnesses++;
  }else if(c.status==='unsolvable'){
    const audit=A.analyze(A.toBoard(c.board),c.tray,100000);
    assert(audit.complete);assert.equal(audit.status,'unsolvable');fatalVerified++;
  }
 }
 const fatalEnds={};
 for(const style of ['clear','three','plausible']){
  const ended=pilot.runs.filter(r=>r.mode==='risky'&&r.style===style&&r.ended);
  fatalEnds[style]={ended:ended.length,fatalLast:ended.filter(r=>risk.observed.some(c=>c.split===r.split&&c.seed===r.seed&&c.style===style&&c.move===r.deals.at(-1).move&&c.status==='unsolvable')).length};
 }
 const result={valid:true,fatalVerified,loadWitnesses,fatalEnds,loadRiskSha256:createHash('sha256').update(riskBytes).digest('hex')};
 await fs.writeFile('docs/qa/director-order-load/load-risk-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await server.close();}
