/** Independent cells plus existing exact public replay; inputs remain private. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
try {
  const V=await server.ssrLoadModule('/scripts/calibration/replay.ts');
  const R=await server.ssrLoadModule('/src/core/rules.ts');
  let moves=0;
  for(const file of process.argv.slice(2)) {
    const replay=V.replayRecord(JSON.parse(await fs.readFile(file,'utf8')));
    for(const m of replay.moves) {
      const b=[...m.before.board],shape=R.shapeById(m.before.tray[m.event.move.slot].shapeId);
      for(const [dx,dy] of shape.cells){const x=m.event.move.x+dx,y=m.event.move.y+dy;assert(x>=0&&x<8&&y>=0&&y<8);assert.equal(b[y*8+x],0);b[y*8+x]=m.before.tray[m.event.move.slot].color;}
      const rows=[],cols=[];for(let n=0;n<8;n++){if(Array.from({length:8},(_,x)=>b[n*8+x]).every(Boolean))rows.push(n);if(Array.from({length:8},(_,y)=>b[y*8+n]).every(Boolean))cols.push(n);}
      for(let n=0;n<64;n++)if(rows.includes(n>>3)||cols.includes(n%8))b[n]=0;
      assert.deepEqual(b,m.after.board);assert.equal(rows.length+cols.length,m.lines);moves++;
    }
    console.log(JSON.stringify({file:file.split('/').at(-1),moves:replay.moves.length,segments:replay.segments.length,exact:true,cells:true}));
  }
  console.log('TOTAL',moves);
} finally {await server.close();}
