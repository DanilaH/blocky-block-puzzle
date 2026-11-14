/** Offline construction of eight fixed legal openings; no player records. */
import {createServer} from "vite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const server=await createServer({server:{middlewareMode:true}});
try {
 const R=await server.ssrLoadModule('/src/core/rules.ts');
 const templates=[['I4','L3','T4'],['I5','L3','SZ4'],['I3','T4','SZ4'],['I5','O2','T4'],['I2','L5','T4'],['I3','L3','R6'],['O2','L3','I5'],['I2','T4','R6']];
 const results=[]; const base=R.newGame(1,'opening-build','initial-v1');
 for(const families of templates){
  const variants=families.map(f=>R.SHAPES.filter(s=>s.family===f));let found=null;
  outer:for(const a of variants[0])for(const b of variants[1])for(const c of variants[2]){
   const shapes=[a,b,c];
   function visit(board,slot,moves,lines){
    if(slot===3)return lines===1?moves:null;
    const shape=shapes[slot];
    for(let y=0;y<=8-shape.height;y++)for(let x=0;x<=8-shape.width;x++){
     if(slot===0&&(x!==0||y!==0))continue;
     if(!R.fits(board,shape,x,y))continue;
     const g={...base,board,tray:shapes.map((s,i)=>({shapeId:s.id,color:i+1,used:i<slot}))};
     const r=R.applyMove(g,{slot,x,y},g.revision);
     assert(r);
     if(r.allClear||lines+r.lines>1)continue;
     const result=visit(r.state.board,slot+1,[...moves,{slot,x,y}],lines+r.lines);
     if(result)return result;
    }
    return null;
   }
   const witness=visit(Array(64).fill(0),0,[],0);
   if(witness){found={shapeIds:shapes.map(s=>s.id),witness};break outer;}
  }
  assert(found,`No opening for ${families}`);results.push(found);
 }
 const text='// Generated and independently verified by scripts/commercial/build-openings.mjs.\nexport const OPENINGS = '+JSON.stringify(results,null,2)+' as const;\n';
 await fs.writeFile('src/core/opening-catalog.ts',text);console.log(JSON.stringify(results));
}finally{await server.close();}
