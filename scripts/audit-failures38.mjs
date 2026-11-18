import {createServer} from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true}});
try{
 const R=await server.ssrLoadModule('/src/core/rules.ts'),reports=[];
 for(const seed of [35909616,35635958,35733693]){
  let g=R.newGame(seed,'case','flow-v2'),start=null,route=[];
  while(g.status==='playing'&&g.moves<120){
   if(g.tray.every(s=>!s.used)){start=structuredClone(g);route=[];}
   let best=-Infinity,chosen;
   for(let slot=0;slot<3;slot++)if(!g.tray[slot].used)for(const p of R.placements(g.board,R.shapeById(g.tray[slot].shapeId))){
    const v=R.place(g.board,R.shapeById(g.tray[slot].shapeId),p.x,p.y);let edges=0;
    for(let i=0;i<64;i++)if(v.board[i]){if(i%8<7&&!v.board[i+1])edges++;if(i<56&&!v.board[i+8])edges++;}
    const value=v.lines*200-v.board.filter(Boolean).length-edges*3;
    if(value>best){best=value;chosen={slot,...p};}
   }
   route.push(chosen);g=R.applyMove(g,chosen,g.revision).state;
  }
  reports.push({seed,deathMove:g.moves,deal:start,chosenRoute:route,availableRoute:R.proveTray(start.board,start.tray),endBoard:g.board,endTray:g.tray});
 }
 await fs.writeFile('docs/qa/preplay-0.38/regressions.json',JSON.stringify(reports,null,2));console.log(reports.map(r=>({seed:r.seed,deathMove:r.deathMove,chosen:r.chosenRoute,available:r.availableRoute})));
}finally{await server.close();}
