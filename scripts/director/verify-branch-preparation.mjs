// D82 independent JavaScript screen/tree, public-rule and player replay.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {runtime,hash,playerSeed} from './architecture/runtime.mjs';
const out='docs/qa/branch-preparation',bytes=await fs.readFile(`${out}/results.json`),data=JSON.parse(bytes),rt=await runtime();
try{
  for(const[p,h]of Object.entries(data.source))assert.equal(hash(await fs.readFile(p)),h,p);
  const pop=n=>{let c=0;for(;n;n&=n-1)c++;return c;};
  const mask=rows=>rows.reduce((n,r,y)=>n|BigInt(r)<<BigInt(8*y),0n).toString();
  const coverCache=new Map();
  function cover(rows){const key=rows.join(',');if(coverCache.has(key))return coverCache.get(key);let best=8;
    for(let m=0;m<256;m++){let columns=0;for(let y=0;y<8;y++)if(!(m&1<<y))columns|=rows[y];best=Math.min(best,pop(m)+pop(columns));}
    coverCache.set(key,best);return best;}
  const trayFor=bag=>[bag[2],bag[0],bag[1]].map((id,i)=>({shapeId:rt.shapes[id].id,color:i+1,used:false}));
  const emptyStats=()=>({paths:0,dead:0,rewards:0,worstCover:0,sumCover:0,minClears:4,sumLines:0,sumOccupied:0});
  function add(s,board,lines,clears,reward,dead){const c=reward?0:cover(rt.A.toRows(board));s.paths++;s.dead+=Number(dead);s.rewards+=Number(reward);s.worstCover=Math.max(s.worstCover,c);s.sumCover+=c;s.minClears=Math.min(s.minClears,clears);s.sumLines+=lines;s.sumOccupied+=reward?0:board.filter(Boolean).length;}
  function take(board,tray,move){assert(!tray[move.slot].used);const shapeId=tray[move.slot].shapeId,shape=rt.R.shapeById(shapeId);assert(rt.R.fits(board,shape,move.x,move.y));const n=rt.R.place(board,shape,move.x,move.y);return{...n,shapeId};}
  function screen(board,bag){const stats=emptyStats();
    for(const quantile of[0,.25,.5,.75,.999999]){let b=board,lines=0,clears=0,reward=false;const tray=trayFor(bag);
      for(let d=0;d<3;d++){const opts=rt.MP.boundedOptions(b,tray);if(!opts.length)break;const m=opts[Math.min(opts.length-1,Math.floor(quantile*opts.length))].move,n=take(b,tray,m);b=n.board;tray[m.slot].used=true;lines+=n.lines;clears+=Number(n.lines>0);reward||=b.every(x=>!x);}
      add(stats,b,lines,clears,reward,tray.some(s=>!s.used));}return stats;}
  const fixtures=[];
  function tree(board,bag,save=false){const stats=emptyStats(),leaves=[];
    function visit(b,tray,lines,clears,reward,path){const options=tray.every(s=>s.used)?[]:rt.MP.boundedOptions(b,tray);
      if(!options.length){const dead=tray.some(s=>!s.used);add(stats,b,lines,clears,reward,dead);leaves.push({board:mask(rt.A.toRows(b)),lines,clears,reward,dead,path});return;}
      for(const o of options){const m=o.move,n=take(b,tray,m),next=structuredClone(tray);next[m.slot].used=true;
        if(save)fixtures.push({rows:rt.A.toRows(b),shapeId:n.shapeId,x:m.x,y:m.y,after:rt.A.toRows(n.board),lines:n.lines});
        visit(n.board,next,lines+n.lines,clears+Number(n.lines>0),reward||n.board.every(x=>!x),[...path,[m.slot,m.x,m.y]]);}
    }visit(board,trayFor(bag),0,0,false,[]);return{stats,leaves};}
  function compare(a,b){const v=[[Number(a.dead===0),Number(b.dead===0)],[Number(a.minClears>=1),Number(b.minClears>=1)],
    [Number(a.rewards===a.paths),Number(b.rewards===b.paths)],[a.rewards*b.paths,b.rewards*a.paths],[-a.worstCover,-b.worstCover],
    [-a.sumCover*b.paths,-b.sumCover*a.paths],[a.minClears,b.minClears],[a.sumLines*b.paths,b.sumLines*a.paths],[-a.sumOccupied*b.paths,-b.sumOccupied*a.paths]];
    for(const[x,y]of v)if(x!==y)return y-x;return 0;}
  const bagCompare=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
  let trees=0,treePaths=0;
  for(const[qindex,q]of data.prepareQueries.entries()){
    const board=rt.A.toBoard(Array.from({length:8},(_,y)=>Number(BigInt(q.board)>>BigInt(8*y)&255n)));
    assert.equal(q.bags,5456);const ranked=[];
    for(const p of q.pool){assert.deepEqual(screen(board,p.bag),p.screen);const t=tree(board,p.bag,ranked.length===0);trees++;treePaths+=t.leaves.length;assert.deepEqual(t.stats,p.tree);if(!ranked.length)assert.deepEqual(t.leaves,q.leaves);ranked.push(p);}
    assert.deepEqual([...ranked].sort((a,b)=>compare(a.tree,b.tree)||bagCompare(a.bag,b.bag)),ranked);
    if((qindex+1)%30===0)console.log(JSON.stringify({stage:'full-tree-replay',done:qindex+1,total:data.prepareQueries.length}));
  }
  // Complete independent multiset screen on the first engineering field.
  const initial=rt.A.toBoard(data.inputs[0].rows),all=[];let count=0;
  for(let a=0;a<31;a++)for(let b=a;b<31;b++)for(let c=b;c<31;c++){
    const bag=[a,b,c];all.push({bag,stats:screen(initial,bag)});count++;
  }
  all.sort((a,b)=>compare(a.stats,b.stats)||bagCompare(a.bag,b.bag));
  const q0=data.prepareQueries.find(q=>q.board===mask(data.inputs[0].rows));
  assert.deepEqual([...q0.pool].sort((a,b)=>a.screenRank-b.screenRank).map(p=>({bag:p.bag,stats:p.screen})),all.slice(0,8));
  console.log(JSON.stringify({stage:'complete-independent-screen',bags:count}));
  let sourceMoves=0,actualMoves=0;
  for(const g of data.sourceGames){let state={...rt.R.newGame(g.seed,`branch-preparation-source-${g.seed}`,'director-v2'),scoringVersion:'festival-v4',seriesBonusVersion:1},rng=playerSeed(g.seed);assert.deepEqual(state,g.initial);
    for(const e of g.steps){const roll=rt.R.random(rng);rng=roll.state;assert.equal(roll.value,e.roll);assert.deepEqual(rt.choose(state.board,state.tray,'bounded',e.roll),e.move);
      const p=state.tray[e.move.slot],n=rt.R.applyMove(state,e.move,state.revision);assert(n);
      fixtures.push({rows:rt.A.toRows(state.board),shapeId:p.shapeId,x:e.move.x,y:e.move.y,after:e.rows,lines:e.lines});
      state=n.state;assert.deepEqual(rt.A.toRows(state.board),e.rows);assert.equal(n.lines,e.lines);assert.equal(n.allClear,e.clear);sourceMoves++;}
    assert.equal(hash(state),g.finalHash);
  }
  for(const e of data.episodes){let b=rt.A.toBoard(data.inputs[e.input].rows),tray;
    for(let j=0;j<e.events.length;j++){const a=e.events[j];if(j%3===0){const d=e.deals[j/3];assert.deepEqual(d.rows,rt.A.toRows(b));tray=structuredClone(d.tray);
        const q=(e.mode==='prepare'?data.prepareQueries:data.reachQueries)[d.query];assert.equal(q.board,mask(d.rows));
        if(e.mode==='prepare')assert.deepEqual(tray,trayFor(q.pool[0].bag));else assert.equal(q.status,'found');}
      const options=rt.MP.boundedOptions(b,tray);assert.deepEqual(options,a.options);const choice=Math.min(options.length-1,Math.floor(e.rolls[j]*options.length));assert.equal(choice,a.choice);assert.deepEqual(options[choice].move,{slot:a.slot,x:a.x,y:a.y});
      const n=take(b,tray,a);fixtures.push({rows:rt.A.toRows(b),shapeId:n.shapeId,x:a.x,y:a.y,after:a.rows,lines:a.lines});
      assert.equal(n.shapeId,a.shapeId);b=n.board;tray[a.slot].used=true;assert.deepEqual(rt.A.toRows(b),a.rows);assert.equal(n.lines,a.lines);assert.equal(b.every(x=>!x),a.clear);actualMoves++;}
    assert.deepEqual(rt.A.toRows(b),e.finalRows);assert.equal(e.status==='reward',e.events.some(a=>a.clear));
    if(e.status==='dead')assert.equal(rt.MP.boundedOptions(b,tray).length,0);
    if(e.mode==='prepare')assert(!['short-impossible','construction-unknown'].includes(e.status));
  }
  // Full paired trajectories consume the same exogenous choice stream.
  for(const e of data.episodes.filter(e=>e.mode==='prepare'))assert.deepEqual(e.rolls,data.episodes.find(p=>p.mode==='d81'&&p.input===e.input&&p.trial===e.trial).rolls);
  await fs.writeFile(`${out}/cell-fixtures.json`,JSON.stringify(fixtures)+'\n');
  const checks={schema:'blocky-branch-preparation-public-check-v1',resultSha256:hash(bytes),verifierSha256:hash(await fs.readFile('scripts/director/verify-branch-preparation.mjs')),
    fullTrees:trees,fullTreeLeaves:treePaths,completeIndependentScreen:count,sourceGames:data.sourceGames.length,sourceMoves,actualMoves,cellFixtures:fixtures.length};
  await fs.writeFile(`${out}/checks-public.json`,JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await rt.server.close();}
