import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {createServer} from "vite";
const [file3,file4]=process.argv.slice(2);
const server=await createServer({server:{middlewareMode:true}});
try {
 const R=await server.ssrLoadModule('/src/core/rules.ts'),V=await server.ssrLoadModule('/scripts/calibration/replay.ts'),G=await server.ssrLoadModule('/src/core/goal-director.ts'),C=await server.ssrLoadModule('/src/core/composition-dealer.ts'),H=await server.ssrLoadModule('/src/core/rhythm.ts');
 const replays=[];
 for(const file of [file3,file4]) replays.push(V.replayRecord(JSON.parse(await fs.readFile(file,'utf8'))));
 const replay=replays[1], played=new Set(replay.moves.map(m=>m.before.gameId)),contexts=[];
 const inverse=x=>{const left=(v,n)=>{let r=v;for(let i=n;i<32;i+=n)r^=v<<i;return r>>>0},right=(v,n)=>{let r=v;for(let i=n;i<32;i+=n)r^=v>>>i;return r>>>0};return left(right(left(x,5),17),13)};
 for(const event of replay.record.events) if(event.kind==='checkpoint'&&event.state.moves===0&&played.has(event.state.gameId)) {
  const g=event.state;let seed=g.rngState,found=false;
  for(let n=1;n<=80;n++) {seed=inverse(seed);const d=G.goalDirectorDeal(g.board,seed,0,H.initialRhythmV4(),G.initialGoalDirector());
   if(d.rngState===g.rngState&&JSON.stringify(d.tray)===JSON.stringify(g.tray)){contexts.push({g,seed,moves:0,rhythm:H.initialRhythmV4(),director:G.initialGoalDirector()});found=true;break;}}
  assert(found,'Initial pre-deal state was not reconstructed');
 }
 for(const m of replay.moves) if(m.before.tray.filter(s=>!s.used).length===1) contexts.push({g:m.after,seed:m.before.rngState,moves:m.after.moves,rhythm:H.advanceRhythmV4(m.before.rhythm,m.after.board,m.lines,m.allClear,R.random(m.before.rngState).value),director:G.observeGoalDirector(m.before.goalDirector,m.allClear)});
 assert.equal(contexts.length,88);
 const observations=[];
 for(const [index,c] of contexts.entries()) {
  const base=G.goalDirectorDeal(c.g.board,c.seed,c.moves,c.rhythm,c.director);
  assert.deepEqual(base.tray,c.g.tray);assert.equal(base.rngState,c.g.rngState);
  const started=performance.now(),candidate=C.compositionDeal(c.g.board,c.seed,c.moves,c.rhythm,c.director),ms=performance.now()-started;
  const changed=candidate.tray.flatMap((s,i)=>s.shapeId===base.tray[i].shapeId?[]:[i]);assert(changed.length<=1);
  if(changed.length){const i=changed[0];assert.equal(R.shapeById(candidate.tray[i].shapeId).cells.length,R.shapeById(base.tray[i].shapeId).cells.length);}
  let state={...c.g,tray:candidate.tray,rngState:candidate.rngState,goalDirector:candidate.director,dealerVersion:'composition-v1',status:'playing'};
  let independentMoves=0,lines=0,clears=0;
  for(const move of candidate.witness) {
   const s=R.shapeById(state.tray[move.slot].shapeId),b=[...state.board];
   for(const [dx,dy] of s.cells){const x=move.x+dx,y=move.y+dy;assert(x>=0&&x<8&&y>=0&&y<8);assert.equal(b[y*8+x],0);b[y*8+x]=state.tray[move.slot].color;}
   const rows=[],cols=[];for(let i=0;i<8;i++){if(Array.from({length:8},(_,x)=>b[i*8+x]).every(Boolean))rows.push(i);if(Array.from({length:8},(_,y)=>b[y*8+i]).every(Boolean))cols.push(i);}
   for(let i=0;i<64;i++)if(rows.includes(i>>3)||cols.includes(i%8))b[i]=0;
   const result=R.applyMove(state,move,state.revision);assert(result);assert.deepEqual(result.state.board,b);assert.equal(result.lines,rows.length+cols.length);
   lines+=result.lines;clears+=Number(result.allClear);state=result.state;independentMoves++;
  }
  assert.equal(independentMoves,3);
  observations.push({index:index+1,atMove:c.moves,role:base.director.last,reason:candidate.composition.reason,changed:changed.length===1,checks:candidate.composition.checks,ms,lines,clears});
 }
 const summary={source:'Two private owner recordings; raw inputs not copied into public Git',frozenV2ReplayMoves:replays.reduce((n,r)=>n+r.moves.length,0),historicalContexts:contexts.length,independentWitnessMoves:contexts.length*3,changed:observations.filter(o=>o.changed).length,reasons:Object.fromEntries([...new Set(observations.map(o=>o.reason))].map(reason=>[reason,observations.filter(o=>o.reason===reason).length])),observations};
 await fs.writeFile('docs/qa/commercial-iteration-2026-11-13/historical-regressions.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({...summary,observations:undefined}));
} finally {await server.close()}
