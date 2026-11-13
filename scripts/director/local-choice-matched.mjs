import fs from 'node:fs/promises';
import { gzipSync,gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { hash } from './architecture/runtime.mjs';
import { localRuntime,hashes,playerSeed } from './local-choice/run.mjs';
const inputRaw=await fs.readFile('docs/qa/dealer-architecture/snapshots.json.gz'),old=JSON.parse(gunzipSync(inputRaw));
const rt=await localRuntime(),{R,A,L}=rt,source=await hashes(),results=[];
function play(board,tray,style,seed){let b=board,t=structuredClone(tray),rng=seed,lines=0,earned=false;const actions=[];
 for(let i=0;i<3&&R.hasMove(b,t);i++){const r=R.random(rng);rng=r.state;const m=rt.choose(b,t,style,r.value);assert(m);
  const p=R.place(b,R.shapeById(t[m.slot].shapeId),m.x,m.y);b=p.board;t[m.slot].used=true;lines+=p.lines;earned ||= b.every(c=>!c);actions.push(m);
 }
 return{actions,lines,earned,completed:t.every(s=>s.used),endpoint:A.toRows(b)};
}
try{
 for(const snapshot of old.selected){const board=A.toBoard(snapshot.board),input=snapshot.input;
  const h={sinceClear:input.rhythm?.cycleMoves??snapshot.move,recentBags:input.rhythm?.recentBags??[]};
  const ranked=L.localChoiceDeal(board,input.seed,snapshot.move,h),random=L.localChoiceDeal(board,input.seed,snapshot.move,h,'random');
  assert.deepEqual(ranked.diagnostic.pool,random.diagnostic.pool);assert.equal(ranked.rngState,random.rngState);
  const native=old.results.filter(r=>r.catalogue==='full'&&JSON.stringify(r.origin)===JSON.stringify(snapshot.origin)&&['flow-v4','director-v2'].includes(r.policy));
  const variants=[{policy:'local-choice',...ranked},{policy:'random-pool',...random},...native];
  for(const d of variants){rt.verify(board,d);const plays=[];
   for(const style of ['clear','space','two','three','bounded','lapse'])for(let i=0;i<5;i++)plays.push({style,roll:i,...play(board,d.tray,style,playerSeed(hash(snapshot.origin)+':'+i))});
   results.push({origin:snapshot.origin,board:snapshot.board,history:h,policy:d.policy??'local-choice',tray:d.tray,witness:d.witness,
    diagnostic:d.diagnostic??null,plays});
  }
 }
 assert.deepEqual(await hashes(),source);
 await fs.writeFile('docs/qa/local-choice/matched.json.gz',gzipSync(JSON.stringify({schema:'blocky-local-choice-matched-v1',source,inputSha256:hash(inputRaw),scriptSha256:hash(await fs.readFile('scripts/director/local-choice-matched.mjs')),results})));
 console.log(JSON.stringify({inputs:old.selected.length,variants:results.length,plays:results.reduce((s,r)=>s+r.plays.length,0)}));
}finally{await rt.server.close()}
