import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const input=process.argv[2], out='docs/qa/commercial-iteration-2026-11-13/candidate.json';
const server=await createServer({server:{middlewareMode:true}});
try {
 const R=await server.ssrLoadModule('/src/core/rules.ts'), D=await server.ssrLoadModule('/src/core/composition-dealer.ts'), G=await server.ssrLoadModule('/src/core/goal-director.ts'), P=await server.ssrLoadModule('/scripts/director/mixed-players.ts');
 const regression=[];
 if(input){
  const data=JSON.parse(zlib.gunzipSync(await fs.readFile(input))); console.log('regression input keys',Object.keys(data));
  // Archive observations carry a full state; the extraction below accepts its documented wrapper.
  const list=Array.isArray(data)?data:(data.observations??data.results??data.states);
  if(!Array.isArray(list)) throw Error('Unrecognized regression archive');
  for(const item of list){
   const s=item.state??item; const board=s.board, tray=s.tray;
   // Feasibility archive contains issued trays, not the pre-deal RNG/controller state.
   // Its existing same-area proofs are checked separately; no invented planner input.
   if(board&&tray) regression.push({board:board.length,slots:tray.length});
  }
 }
 const games=[];
 for(let seed=4101001;seed<=4101008;seed++) for(const style of ['bounded','three','lapse']) for(const policy of ['director-v2','composition-v1']) {
  let g=R.newGame(seed,'candidate-'+seed,policy), rng=(seed^0x9e3779b9)>>>0,clearMoves=0,allClears=0,issued=0,small=0,large=0,changes=0,checks=0;const roles={};const t=performance.now();
  function count(tray,role){const r=roles[role]??={issued:0,small:0};for(const s of tray){const p=R.shapeById(s.shapeId);issued++;r.issued++;if(['L3','T4','SZ4'].includes(p.family)){small++;r.small++;}large+=Number(p.cells.length>=6)}}
  count(g.tray,g.goalDirector.last);
  while(g.status==='playing'&&g.moves<180){const roll=R.random(rng);rng=roll.state;const m=P.chooseMixed(g.board,g.tray,style,roll.value).move;assert(m);const refill=g.tray.filter(s=>!s.used).length===1;const moved=R.applyMove(g,m,g.revision);assert(moved);g=moved.state;clearMoves+=Number(moved.lines>0);allClears+=Number(moved.allClear);if(refill)count(g.tray,g.goalDirector.last);}
  games.push({seed,style,policy,moves:g.moves,ended:g.status==='over',clearMoves,allClears,issued,small,large,roles,cpuMs:performance.now()-t});
  console.log(JSON.stringify(games.at(-1)));
 }
 const gates=[];
 for(const style of ['bounded','three','lapse']){const b=games.filter(g=>g.style===style&&g.policy==='director-v2'), c=games.filter(g=>g.style===style&&g.policy==='composition-v1');const sum=(a,k)=>a.reduce((n,g)=>n+g[k],0);gates.push({style,ordinaryLines:sum(c,'clearMoves')/sum(c,'moves')>=.8*sum(b,'clearMoves')/sum(b,'moves'),duration:sum(c,'moves')<=1.25*sum(b,'moves'),candidateEnded:c.filter(g=>g.ended).length,baselineEnded:b.filter(g=>g.ended).length,baselineSmall:sum(b,'small')/sum(b,'issued'),candidateSmall:sum(c,'small')/sum(c,'issued')});}
 const report={protocol:'PROTOCOL.md frozen seeds and limits',source:'48 engineering bot launches; one candidate, not human approval',games,gates,behaviorPass:gates.every(g=>g.ordinaryLines&&g.duration&&(g.style!=='lapse'||g.candidateEnded>0))};
 await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log('GATES',JSON.stringify(gates));
}finally{await server.close()}
