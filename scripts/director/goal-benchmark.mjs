import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {goalRuntime} from './goal-runtime.mjs';
const options=process.argv.slice(2),arg=(k,f)=>options.includes(k)?options[options.indexOf(k)+1]:f;
const selected=arg('--split','all'),seeds=Number(arg('--seeds','8')),limit=Number(arg('--limit','360'));
const output=arg('--out','docs/qa/director-goal-cycle/results.json.gz');
assert(seeds>0&&seeds<=8&&limit>0&&limit<=360);
const {server,R,D,H,P,A}=await goalRuntime(),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sourceFiles=['src/core/goal-director.ts','src/core/director-search.ts','src/core/rules.ts','src/core/profile.ts','src/core/monetization.ts','src/core/rhythm.ts','src/core/shapes.json','src/game/move-calculator.ts','scripts/difficulty/players.ts','scripts/director/goal-benchmark.mjs','docs/qa/director-goal-cycle/protocol.md'];
async function sourceHashes(){return Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])));}
const source=await sourceHashes(),runs=[],timing=[];let proofs=0,maxWork=0;
function inspect(board,d){
  assert(d.diagnostic.checks<=24000);maxWork=Math.max(maxWork,d.diagnostic.checks);
  let b=board;const used=new Set();
  for(const m of d.witness){assert(!used.has(m.slot));used.add(m.slot);const s=R.shapeById(d.tray[m.slot].shapeId);assert(R.fits(b,s,m.x,m.y));b=R.place(b,s,m.x,m.y).board;}
  assert.equal(used.size,3);proofs++;
  if(d.diagnostic.actual==='load'){
    assert(d.tray.some(s=>R.shapeById(s.shapeId).cells.length>=6));assert(d.tray.some(s=>R.shapeById(s.shapeId).cells.length<=4));
  }
}
try{
 for(const [split,offset] of [['development',1041000],['confirmation',1061000]]){
  if(selected!=='all'&&selected!==split)continue;
  for(let i=1;i<=seeds;i++)for(const style of ['clear','three','plausible'])for(const mode of ['baseline','candidate']){
    const seed=offset+i,version=mode==='baseline'?'flow-v4':'director-v2',started=performance.now();
    let g=R.newGame(seed,'goal-cycle-'+seed,version);timing.push({split,seed,style,mode,move:0,kind:'initial',ms:performance.now()-started});
    let playerRng=(seed^0x9e3779b9)>>>0,lastLoad=-Infinity;
    const actions=[],events=[],deals=[];
    function record(board,d,move,input){
      inspect(board,d);
      assert.deepEqual(d.tray,g.tray);assert.equal(d.rngState,g.rngState);assert.deepEqual(d.director,g.goalDirector);
      if(d.diagnostic.actual==='load'){assert(move>=12);assert(move-lastLoad>=12);lastLoad=move;}
      deals.push({move,board:A.toRows(board),tray:d.tray,witness:d.witness,diagnostic:d.diagnostic,input,outputRng:d.rngState,outputDirector:d.director});
    }
    if(mode==='candidate')record(g.board,D.goalDirectorDeal(g.board,seed),0,{seed,moves:0});
    while(g.status==='playing'&&g.moves<limit){
      const roll=R.random(playerRng);playerRng=roll.state;
      const move=P.choose(g.board,g.tray,style,roll.value);assert(move);
      const before=g,refill=g.tray.filter(s=>!s.used).length===1;
      const began=performance.now(),moved=R.applyMove(g,move,g.revision);assert(moved);g=moved.state;
      if(refill)timing.push({split,seed,style,mode,move:g.moves,kind:'refill',ms:performance.now()-began});
      if(refill&&mode==='candidate'){
        const rhythm=H.advanceRhythmV4(before.rhythm,g.board,moved.lines,moved.allClear,R.random(before.rngState).value);
        const saved=D.observeGoalDirector(before.goalDirector,moved.allClear),input={seed:before.rngState,moves:g.moves,rhythm,saved};
        record(g.board,D.goalDirectorDeal(g.board,input.seed,g.moves,rhythm,saved),g.moves,input);
      }
      actions.push([move.slot,move.x,move.y]);events.push([moved.lines,Number(moved.allClear),g.board.filter(Boolean).length]);
    }
    const rewards=events.flatMap((e,i)=>e[0]?[i+1]:[]),clears=events.flatMap((e,i)=>e[1]?[i+1]:[]);
    const row={split,seed,style,mode,moves:g.moves,score:g.score,ended:g.status==='over',censored:g.status==='playing',
      lines:events.reduce((n,e)=>n+e[0],0),clears:clears.length,firstClear:clears[0]??null,
      firstReward:rewards[0]??null,initialDry:rewards[0]??g.moves,terminalDry:g.moves-(rewards.at(-1)??0),
      gaps:rewards.slice(1).map((n,i)=>n-rewards[i]),fallbacks:g.dealerFallbacks,actions,events,deals,finalHash:hash(g)};
    runs.push(row);await fs.writeFile(output+'.checkpoint',JSON.stringify({source,runs,timing}));
    console.log(JSON.stringify({split,seed,style,mode,moves:g.moves,ended:row.ended,clears:row.clears,
      load:deals.filter(d=>d.diagnostic.actual==='load').length,tasks:deals.filter(d=>d.diagnostic.certificate).length}));
  }
 }
 assert.deepEqual(await sourceHashes(),source,'Source changed during study');
 const result={schema:'blocky-goal-cycle-study-v1',seeds,limit,runs,timing,source,proofs,maxWork,
    environment:{node:process.version,vite:JSON.parse(await fs.readFile('node_modules/vite/package.json')).version}};
 await fs.writeFile(output,gzipSync(JSON.stringify(result)+'\n'));
 console.log(JSON.stringify({output,games:runs.length,moves:runs.reduce((n,r)=>n+r.moves,0),proofs,maxWork}));
}finally{await server.close();}
