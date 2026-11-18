import {createServer} from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true}});
try {
 const R=await server.ssrLoadModule('/src/core/rules.ts');
 const results=[]; const seeds=Number(process.env.SIM_SEEDS??60),limit=Number(process.env.SIM_LIMIT??120);
 for(const strategy of ['random','greedy'])for(const policy of ['initial-v1','flow-v1']) {
  let allClear=0, moves=0, early=0, deaths=0, max=0, elapsed=0;const shapes=new Set();
  for(let seed=1;seed<=seeds;seed++) {
   let g=R.newGame(seed*1777,`s${seed}`,policy);
   while(g.status==='playing'&&g.moves<limit) {
    const options=g.tray.flatMap((s,slot)=>s.used?[]:R.placements(g.board,R.shapeById(s.shapeId)).map(p=>({slot,...p})));
    let move=options[(seed*31+g.moves*17)%options.length];
    if(strategy==='greedy') {
     let best=-Infinity;
     for(const m of options) {
      const p=R.place(g.board,R.shapeById(g.tray[m.slot].shapeId),m.x,m.y);let perimeter=0;
      for(let i=0;i<64;i++)if(p.board[i]){if(i%8<7&&!p.board[i+1])perimeter++;if(i<56&&!p.board[i+8])perimeter++;}
      const score=p.lines*200-p.board.filter(Boolean).length-perimeter*3;
      if(score>best){best=score;move=m;}
     }
    }
    shapes.add(g.tray[move.slot].shapeId);
    const start=performance.now(),r=R.applyMove(g,move,g.revision);elapsed+=performance.now()-start;
    allClear+=Number(r.allClear);g=r.state;max=Math.max(max,g.streak);
   }
   moves+=g.moves;deaths+=Number(g.status==='over');early+=Number(g.status==='over'&&g.moves<12);
  }
  results.push({strategy,policy,games:seeds,limit,allClear,moves,early,deaths,max,distinctShapes:shapes.size,calculationMs:Math.round(elapsed)});
  console.log(JSON.stringify(results.at(-1)));
 }
 await fs.mkdir('docs/qa/flow-0.37',{recursive:true});await fs.writeFile('docs/qa/flow-0.37/simulation.json',JSON.stringify(results,null,2));
} finally {await server.close();}
