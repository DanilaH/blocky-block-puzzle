import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { runtime, hash, sourceHashes } from '../architecture/runtime.mjs';

export async function hashes() {
 const result=await sourceHashes();
 for(const p of ['scripts/director/local-choice/dealer.ts','scripts/director/local-choice/run.mjs','docs/qa/local-choice/protocol.md','tests/local-choice.test.ts']) result[p]=hash(await fs.readFile(p));
 return result;
}
export const playerSeed=seed=>createHash('sha256').update('local-choice-player:'+seed).digest().readUInt32LE(0);
export async function localRuntime(){
 const rt=await runtime('full');
 const L=await rt.server.ssrLoadModule('/scripts/director/local-choice/dealer.ts');
 return {...rt,L,choose:(b,t,s,r)=>s==='two'?rt.P.choose(b,t,'two',r):rt.choose(b,t,s,r)};
}
export function checkPool(rt,board,d){
 rt.verify(board,d);
 for(const a of d.diagnostic?.pool??[]){rt.verify(board,a);
  for(const root of a.roots)for(const second of root.seconds)for(const witness of second.witnesses)rt.verify(board,{tray:a.tray,witness});
 }
}
export function broad(rt,board,tray){
 const {R,MP,SR}=rt, roots=[];
 for(const {move:m} of MP.boundedOptions(board,tray).slice(0,3)){
  const p=R.place(board,R.shapeById(tray[m.slot].shapeId),m.x,m.y),t=tray.map((s,i)=>({...s,used:i===m.slot}));
  const proof=SR.solveRemaining(p.board,t,5000),seconds=[];
  for(const {move:n} of MP.boundedOptions(p.board,t).slice(0,3)){
   const p2=R.place(p.board,R.shapeById(t[n.slot].shapeId),n.x,n.y),t2=t.map((s,i)=>({...s,used:s.used||i===n.slot}));
   const tail=SR.solveRemaining(p2.board,t2,1000);
   seconds.push({move:n,status:tail.status,witness:tail.witness});
  }
  roots.push({move:m,status:proof.status,witness:proof.witness,seconds});
 }
 return {safe:roots.length>0&&roots.every(r=>r.status==='found'&&r.seconds.length&&r.seconds.every(s=>s.status==='found')),roots};
}
async function main(){
 const stage=process.argv[2]??'engineering';assert(['engineering','holdout'].includes(stage));
 const rt=await localRuntime(),{R,H,G,A,L}=rt,source=await hashes(),runs=[],timings=[];
 const styles=stage==='engineering'?['clear','three','bounded']:['clear','space','two','three','bounded','lapse'];
 const splits=stage==='engineering'?[['engineering',2441000,4]]:[['development',2541000,8],['confirmation',2561000,8]];
 const cap=stage==='engineering'?180:360,output=`docs/qa/local-choice/${stage}.json.gz`;
 try{
  for(const [split,offset,n]of splits)for(let i=1;i<=n;i++)for(const style of styles)for(const policy of ['flow-v4','director-v2','local-choice','random-pool']){
   const seed=offset+i,local=['local-choice','random-pool'].includes(policy),version=local?'initial-v1':policy;
   let history=L.initialLocalHistory(),rng=playerSeed(seed),g=R.newGame(seed,'local-choice-'+seed,version);
   function generate(board,input){const start=performance.now();
    const d=local?L.localChoiceDeal(board,input.seed,input.moves,history,policy==='random-pool'?'random':'ranked')
     :R.deal(board,input.seed,policy,input.moves,input.previous??'',input.rhythm,undefined,input.saved);
    timings.push({split,seed,style,policy,move:input.moves,ms:performance.now()-start});checkPool(rt,board,d);return d;
   }
   const first=generate(R.emptyBoard(),{seed,moves:0});
   if(local)g={...g,tray:first.tray,rngState:first.rngState,dealerFallbacks:Number(first.fallback)};
   else{assert.deepEqual(g.tray,first.tray);assert.equal(g.rngState,first.rngState)}
   g={...g,scoringVersion:'festival-v4',seriesBonusVersion:1};
   history={...history,recentBags:[first.tray.map(s=>R.shapeById(s.shapeId).family).sort().join(',')]};
   const actions=[],events=[],deals=[];
   const record=(d,input)=>deals.push({move:g.moves,board:A.toRows(g.board),input,tray:d.tray,witness:d.witness,fallback:d.fallback,diagnostic:d.diagnostic??null,broad:broad(rt,g.board,d.tray)});
   record(first,{seed,moves:0,history:L.initialLocalHistory()});
   while(g.status==='playing'&&g.moves<cap){
    const r=R.random(rng);rng=r.state;const move=rt.choose(g.board,g.tray,style,r.value);assert(move);
    const before=g,refill=g.tray.filter(s=>!s.used).length===1;
    const op=A.actions(A.toRows(g.board),g.tray).find(o=>o.slot===move.slot&&o.x===move.x&&o.y===move.y);assert(op);
    const expected=A.transition(A.toRows(g.board),op),a=R.applyMove(g,move,g.revision);assert(a);g=a.state;
    assert.deepEqual(A.toRows(g.board),expected.rows);assert.equal(a.lines,expected.lines);
    history=L.observeLocalHistory(history,a.allClear);
    if(refill){
     const input={seed:before.rngState,moves:g.moves,previous:before.tray.map(s=>R.shapeById(s.shapeId).family).sort().join(','),history};
     if(!local){input.rhythm=H.advanceRhythmV4(before.rhythm,g.board,a.lines,a.allClear,R.random(before.rngState).value);if(policy==='director-v2')input.saved=G.observeGoalDirector(before.goalDirector,a.allClear)}
     const d=generate(g.board,input);
     if(local)g={...g,tray:d.tray,rngState:d.rngState,dealerFallbacks:before.dealerFallbacks+Number(d.fallback),status:R.hasMove(g.board,d.tray)?'playing':'over'};
     else{assert.deepEqual(g.tray,d.tray);assert.equal(g.rngState,d.rngState)}
     record(d,input);history={...history,recentBags:[...history.recentBags,d.tray.map(s=>R.shapeById(s.shapeId).family).sort().join(',')].slice(-4)};
    }
    actions.push([move.slot,move.x,move.y]);events.push([a.lines,Number(a.allClear),g.board.filter(Boolean).length]);
   }
   const run={split,seed,style,policy,moves:g.moves,ended:g.status==='over',censored:g.status==='playing',actions,events,deals,finalHash:hash({game:g,history})};runs.push(run);
   await fs.writeFile(output+'.checkpoint',gzipSync(JSON.stringify({source,stage,cap,runs,timings})));
   console.log(JSON.stringify({split,seed,style,policy,moves:g.moves,ended:run.ended,allClear:events.filter(e=>e[1]).length}));
  }
  assert.deepEqual(await hashes(),source,'frozen sources changed');
  await fs.writeFile(output,gzipSync(JSON.stringify({schema:'blocky-local-choice-v1',source,stage,cap,runs,timings})));await fs.rm(output+'.checkpoint');
  console.log(JSON.stringify({output,games:runs.length,moves:runs.reduce((s,r)=>s+r.moves,0)}));
 }finally{await rt.server.close()}
}
if(process.argv[1]?.endsWith('/local-choice/run.mjs'))await main();
