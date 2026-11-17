/** Same-input regression only; never replay human moves under a changed policy. */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/sparse-build/compare-record.mjs PRIVATE_RECORD OUTPUT');
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
try{
 const R=await server.ssrLoadModule('/src/core/rules.ts'),V=await server.ssrLoadModule('/scripts/calibration/replay.ts'),B=await server.ssrLoadModule('/src/core/challenge-build-v1.ts'),O=await server.ssrLoadModule('/scripts/challenge-content/oracle.ts');
 const bytes=await fs.readFile(input),replay=V.replayRecord(JSON.parse(bytes));
 const counts={refills:0,empty:0,emptyBefore:0,emptyAfter:0,low8:0,low8Before:0,low8After:0,unchangedDenseOrRecovery:0,technicalPass:true};
 function clears(board,d){let b=board,n=0;for(const m of d.witness){const r=R.place(b,R.shapeById(d.tray[m.slot].shapeId),m.x,m.y);b=r.board;n+=Number(!b.some(Boolean));}return n;}
 for(const m of replay.moves){
  if(m.before.tray.filter(s=>!s.used).length!==1)continue;
  const r=R.applyMove(m.before,m.event.move,m.before.revision,true,m.event.observation),t=r.decision,i=t.input,c=i.context;
  assert.equal(i.policy,'director-challenge-v2');
  const before={tray:r.state.tray,witness:t.validation.witness,rngState:t.seedAfter,director:r.state.goalDirector};
  const after=B.challengeBuildDeal(i.board,i.seed,i.moves,c.rhythm,c.goalDirector,{...c.challengeV2State,configId:'challenge-build-v1'});
  O.verifyWitness(i.board,after.tray,after.witness);assert(after.diagnostic.checks<=24000);
  const count=i.board.filter(Boolean).length,a=Number(clears(i.board,before)>0),b=Number(clears(i.board,after)>0);
  counts.refills++;
  if(!count){counts.empty++;counts.emptyBefore+=a;counts.emptyAfter+=b;}
  if(count<=8){counts.low8++;counts.low8Before+=a;counts.low8After+=b;}
  if(count>16||c.rhythm.recoveryDeals){for(const k of ['tray','witness','rngState','director'])assert.deepEqual(after[k],before[k]);counts.unchangedDenseOrRecovery++;}
 }
 const report={kind:'same-input regression, not new player trajectories',exactOriginalMoves:replay.moves.length,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),...counts,guards:{empty:counts.emptyAfter<=2,low8:counts.low8After<=9}};
 await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await server.close();}
