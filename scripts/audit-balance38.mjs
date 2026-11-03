import {createServer} from 'vite';
import fs from 'node:fs/promises';
import {makePlanner} from './audit-planner38.mjs';
const server=await createServer({server:{middlewareMode:true}});
const seeds=Number(process.env.SIM_SEEDS||60),offset=Number(process.env.SIM_OFFSET||0),limit=Number(process.env.SIM_LIMIT||120);
const policies=(process.env.SIM_POLICIES||'initial-v1,flow-v1,flow-v2').split(',');
const strategies=(process.env.SIM_STRATEGIES||'random,greedy,imperfect,planner').split(',');
const out=process.env.SIM_OUT||'/tmp/balance38.json';
try {
 const R=await server.ssrLoadModule('/src/core/rules.ts');const all=[];
 const score=b=>{let edges=0;for(let i=0;i<64;i++)if(b[i]){if(i%8<7&&!b[i+1])edges++;if(i<56&&!b[i+8])edges++;}return -b.filter(Boolean).length-edges*3;};
 const opts=(board,tray)=>tray.flatMap((s,slot)=>s.used?[]:R.placements(board,R.shapeById(s.shapeId)).map(m=>{const p=R.place(board,R.shapeById(s.shapeId),m.x,m.y);return {move:{slot,...m},board:p.board,lines:p.lines,value:p.lines*200+score(p.board)};}));
 function pickReference(g,strategy,rng){
  const a=opts(g.board,g.tray);if(!a.length)throw Error('playing without move');
  if(strategy==='random'||strategy==='imperfect'&&rng<.2)return a[Math.floor((rng*(strategy==='imperfect'?5:1))*a.length)].move;
  a.sort((a,b)=>b.value-a.value);
  if(strategy!=='planner')return a[0].move;
  let beam=a.slice(0,8).map(p=>({...p,first:p.move,used:1<<p.move.slot,depth:1}));
  for(let d=1;d<g.tray.filter(s=>!s.used).length;d++){
   const children=[];
   for(const n of beam)for(const p of opts(n.board,g.tray.map((s,i)=>({...s,used:s.used||!!(n.used&(1<<i))}))))children.push({...p,first:n.first,used:n.used|(1<<p.move.slot),depth:d+1,lines:n.lines+p.lines,value:(n.lines+p.lines)*200+score(p.board)});
   if(!children.length)break;children.sort((a,b)=>b.value-a.value);beam=children.slice(0,8);
  }
  beam.sort((a,b)=>b.depth-a.depth||b.value-a.value);return beam[0].first;
 }
 const planner=makePlanner(R);
 const pick=(g,strategy,rng)=>strategy==='planner'?planner(g):pickReference(g,strategy,rng);
 if(process.env.SIM_VERIFY_PLANNER){
  let comparisons=0;
  for(let seed=1;seed<=12;seed++){
   let g=R.newGame(seed*1777,'verify','flow-v2');
   for(let turn=0;turn<12&&g.status==='playing';turn++){
    const fast=planner(g),slow=pickReference(g,'planner',0);
    if(JSON.stringify(fast)!==JSON.stringify(slow))throw Error('Planner mismatch '+seed+':'+turn);
    g=R.applyMove(g,fast,g.revision).state;comparisons++;
   }
  }
  console.log(JSON.stringify({plannerDifferentialChecks:comparisons}));
 }
 for(const strategy of strategies)for(const policy of policies){
  const games=[];let ms=0;
  for(let n=1;n<=seeds;n++){
   const seed=(offset+n)*1777;let g=R.newGame(seed,'audit',policy),rng=seed^0x68bc21eb,clears=0,rewards=0,fallbacks=g.dealerFallbacks,lastReward=0,maxGap=0,repeat=0,lastBag='',earlyTrap=0;
   while(g.status==='playing'&&g.moves<limit){
    if(g.tray.every(s=>!s.used)){const bag=g.tray.map(s=>R.shapeById(s.shapeId).family).sort().join(',');repeat+=Number(bag===lastBag);lastBag=bag;}
    const r=R.random(rng);rng=r.state;const m=pick(g,strategy,r.value),t=performance.now(),v=R.applyMove(g,m,g.revision);ms+=performance.now()-t;
    if(v.lines){rewards++;maxGap=Math.max(maxGap,g.moves+1-lastReward);lastReward=g.moves+1;}clears+=Number(v.allClear);g=v.state;
    if(g.status==='over'&&g.tray.filter(s=>s.used).length<3)earlyTrap++;
   }
   games.push({seed,moves:g.moves,dead:g.status==='over',early:g.status==='over'&&g.moves<12,clears,rewards,fallbacks:g.dealerFallbacks-fallbacks,maxGap:Math.max(maxGap,g.moves-lastReward),repeat,earlyTrap,board:g.status==='over'?g.board:undefined,tray:g.status==='over'?g.tray:undefined});
   if(n%25===0)console.error(`${strategy}/${policy}: ${n}/${seeds}`);
  }
  const sum=k=>games.reduce((a,g)=>a+Number(g[k]),0);const entry={strategy,policy,seeds,offset,limit,moves:sum('moves'),deaths:sum('dead'),early:sum('early'),allClear:sum('clears'),rewards:sum('rewards'),fallbacks:sum('fallbacks'),repeatedBags:sum('repeat'),meanMaxGap:sum('maxGap')/seeds,calculationMs:Math.round(ms),games};all.push(entry);
  console.log(JSON.stringify({...entry,games:undefined}));await fs.writeFile(out,JSON.stringify(all,null,2));
 }
}finally{await server.close();}
