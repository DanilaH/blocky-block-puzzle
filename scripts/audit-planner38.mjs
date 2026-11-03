// Independent player, not the dealer's witness. Same beam ordering/heuristic as
// the array-based reference, but 8 row masks avoid 64-cell copies per candidate.
export function makePlanner(R) {
 const pop=Array.from({length:256},(_,n)=>{let c=0;for(;n;n&=n-1)c++;return c;});
 const catalog=new Map(R.SHAPES.map(s=>[s.id,Array.from({length:9-s.height},(_,y)=>Array.from({length:9-s.width},(_,x)=>{
  const rows=Array(8).fill(0);for(const [dx,dy] of s.cells)rows[y+dy]|=1<<(x+dx);return {rows,x,y};
 })).flat()]));
 return g=>{
  const rows=Array(8).fill(0);g.board.forEach((v,i)=>{if(v)rows[i>>3]|=1<<(i%8);});
  let beam=[{rows,used:0,lines:0,value:0,depth:0,first:null}];
  for(let depth=1;depth<=g.tray.filter(s=>!s.used).length;depth++){
   const children=[];
   for(const parent of beam)for(let slot=0;slot<3;slot++){
    if(g.tray[slot].used||(parent.used&(1<<slot)))continue;
    for(const op of catalog.get(g.tray[slot].shapeId)){
     if(op.rows.some((r,y)=>r&parent.rows[y]))continue;
     const next=op.rows.map((r,y)=>r|parent.rows[y]);let cols=255,lines=parent.lines;
     for(const r of next)cols&=r;
     lines+=pop[cols];for(let y=0;y<8;y++){if(next[y]===255){next[y]=0;lines++;}next[y]&=~cols;}
     let occupied=0,edges=0;
     for(let y=0;y<8;y++){const r=next[y];occupied+=pop[r];edges+=pop[(r&~(r>>1))&127];if(y<7)edges+=pop[r&~next[y+1]];}
     children.push({rows:next,used:parent.used|(1<<slot),lines,depth,first:parent.first||{slot,x:op.x,y:op.y},value:lines*200-occupied-edges*3});
    }
   }
   if(!children.length)break;
   children.sort((a,b)=>b.value-a.value);beam=children.slice(0,8);
  }
  return beam[0].first;
 };
}
