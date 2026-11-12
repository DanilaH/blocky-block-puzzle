import fs from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { runtime, hash, playerSeed } from './architecture/runtime.mjs';
const root = 'docs/qa/dealer-architecture';
const raw = await fs.readFile(`${root}/snapshots.json.gz`), data = JSON.parse(gunzipSync(raw));
const protocol = hash(await fs.readFile(`${root}/composition-protocol.md`));
const rows = [];
function play(rt, row, tray, style, roll) {
  let b = rt.A.toBoard(row.board), t = structuredClone(tray), rng = playerSeed(hash(row.origin)+':'+roll), lines = 0, earned = false;
  const actions = [];
  for (let i = 0; i < 3 && rt.R.hasMove(b,t); i++) {
    const r = rt.R.random(rng); rng=r.state;
    const m = rt.choose(b,t,style,r.value); assert(m);
    const p = rt.R.place(b, rt.R.shapeById(t[m.slot].shapeId),m.x,m.y);
    b=p.board;t[m.slot].used=true;lines+=p.lines;earned ||= b.every(c=>!c);actions.push(m);
  }
  return {style,roll,actions,lines,earned,completed:t.every(s=>s.used),endpoint:rt.A.toRows(b)};
}
for (const catalogue of ['full','common']) {
  const rt=await runtime(catalogue);
  try {
    for (const policy of ['flow-v4','director-v2','random-proved']) {
      const originals=data.results.filter(r=>r.catalogue===catalogue&&r.policy===policy);assert.equal(originals.length,48);
      for (const shift of [1,17,31]) for (let i=0;i<originals.length;i++) {
        const original=originals[i],donor=originals[(i+shift)%originals.length];
        const board=rt.A.toBoard(original.board),proof=rt.SR.solveRemaining(board,donor.tray,24000);
        if(proof.witness)rt.verify(board,{tray:donor.tray,witness:proof.witness});
        const plays=[],control=[];
        for(const style of ['clear','space','three','bounded'])for(let roll=0;roll<3;roll++) {
          const own=original.plays.find(p=>p.style===style&&p.roll===roll);
          assert.deepEqual(play(rt,original,original.tray,style,roll),{style,roll,...Object.fromEntries(Object.entries(own).filter(([k])=>!['style','roll'].includes(k)))});
          plays.push(play(rt,original,donor.tray,style,roll));control.push(own);
        }
        rows.push({catalogue,policy,shift,origin:original.origin,donor:donor.origin,board:original.board,
          tray:donor.tray,proof,plays,control});
      }
    }
  }finally{await rt.server.close()}
}
assert.equal(hash(await fs.readFile(`${root}/composition-protocol.md`)),protocol);
await fs.writeFile(`${root}/composition.json.gz`,gzipSync(JSON.stringify({schema:'blocky-composition-shuffle-v1',
  primarySnapshotsSha256:hash(raw),protocolSha256:protocol,scriptSha256:hash(await fs.readFile('scripts/director/shuffle-architecture.mjs')),rows})));
console.log(JSON.stringify({assignments:rows.length,plays:rows.reduce((n,r)=>n+r.plays.length,0),
  found:rows.filter(r=>r.proof.status==='found').length,impossible:rows.filter(r=>r.proof.status==='impossible').length,unknown:rows.filter(r=>r.proof.status==='unknown').length}));
